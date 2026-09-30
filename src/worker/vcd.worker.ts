import { parseVcd } from "../vcd/parser";
import { searchRisingEdges, Condition } from "../vcd/search";
import { CancelledError, VcdFile } from "../vcd/types";

export type WorkerRequest =
  | { type: "parse"; taskId: number; text: string }
  | { type: "search"; taskId: number; clockIndex: number; conditions: Condition[] }
  | { type: "cancel"; taskId: number };

export type WorkerResponse =
  | { type: "progress"; taskId: number; done: number; total: number }
  | { type: "parsed"; taskId: number; vcd: VcdFile }
  | { type: "searched"; taskId: number; hits: bigint[] }
  | { type: "error"; taskId: number; message: string; line?: number; cancelled?: boolean };

let currentVcd: VcdFile | null = null;
const cancelled = new Set<number>();

function post(msg: WorkerResponse) {
  (self as unknown as Worker).postMessage(msg);
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  if (msg.type === "cancel") {
    cancelled.add(msg.taskId);
    return;
  }
  const taskId = msg.taskId;
  const shouldCancel = () => cancelled.has(taskId);
  const onProgress = (done: number, total: number) => post({ type: "progress", taskId, done, total });
  try {
    if (msg.type === "parse") {
      const vcd = await parseVcd(msg.text, { onProgress, shouldCancel });
      if (shouldCancel()) throw new CancelledError();
      currentVcd = vcd;
      post({ type: "parsed", taskId, vcd });
    } else {
      if (!currentVcd) throw new Error("尚未解析任何 VCD 文件");
      const hits = await searchRisingEdges(currentVcd, msg.clockIndex, msg.conditions, { onProgress, shouldCancel });
      if (shouldCancel()) throw new CancelledError();
      post({ type: "searched", taskId, hits });
    }
  } catch (e) {
    if (e instanceof CancelledError || (e as Error).message === "cancelled") {
      post({ type: "error", taskId, message: "已取消", cancelled: true });
    } else {
      const err = e as Error & { line?: number };
      post({ type: "error", taskId, message: err.message, line: err.line });
    }
  } finally {
    cancelled.delete(taskId);
  }
};
