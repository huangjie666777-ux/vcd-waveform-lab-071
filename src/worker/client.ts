import { Condition } from "../vcd/search";
import { VcdFile } from "../vcd/types";
import { WorkerRequest, WorkerResponse } from "./vcd.worker";

export interface TaskHandle<T> {
  promise: Promise<T>;
  cancel: () => void;
}

interface Pending {
  resolve: (v: never) => void;
  reject: (e: Error) => void;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Wrapper around the VCD worker. Every call gets a fresh task id; stale
 * responses are ignored and superseded tasks are rejected, so an old task
 * can never overwrite newer results.
 */
export class VcdClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor() {
    this.worker = new Worker(new URL("./vcd.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      const p = this.pending.get(msg.taskId);
      if (!p) return; // stale or cancelled task
      if (msg.type === "progress") {
        p.onProgress?.(msg.done, msg.total);
        return;
      }
      this.pending.delete(msg.taskId);
      if (msg.type === "parsed") p.resolve(msg.vcd as never);
      else if (msg.type === "searched") p.resolve(msg.hits as never);
      else {
        const err = new Error(msg.line != null ? `第 ${msg.line} 行: ${msg.message}` : msg.message);
        (err as Error & { cancelled?: boolean }).cancelled = msg.cancelled;
        p.reject(err);
      }
    };
  }

  private run<T>(req: WorkerRequest, onProgress?: (done: number, total: number) => void): TaskHandle<T> {
    const taskId = req.taskId;
    let cancelFn = () => {};
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(taskId, { resolve: resolve as (v: never) => void, reject, onProgress });
      cancelFn = () => {
        if (!this.pending.has(taskId)) return;
        this.pending.delete(taskId);
        this.worker.postMessage({ type: "cancel", taskId } satisfies WorkerRequest);
        const err = new Error("已取消");
        (err as Error & { cancelled?: boolean }).cancelled = true;
        reject(err);
      };
    });
    this.worker.postMessage(req);
    return { promise, cancel: () => cancelFn() };
  }

  /** Cancels every running task (used before starting a replacement task). */
  cancelAll() {
    for (const id of [...this.pending.keys()]) {
      const p = this.pending.get(id)!;
      this.pending.delete(id);
      this.worker.postMessage({ type: "cancel", taskId: id } satisfies WorkerRequest);
      const err = new Error("已被新任务取代");
      (err as Error & { cancelled?: boolean }).cancelled = true;
      p.reject(err);
    }
  }

  parse(text: string, onProgress?: (done: number, total: number) => void): TaskHandle<VcdFile> {
    const taskId = this.nextId++;
    return this.run<VcdFile>({ type: "parse", taskId, text }, onProgress);
  }

  search(
    clockIndex: number,
    conditions: Condition[],
    onProgress?: (done: number, total: number) => void,
  ): TaskHandle<bigint[]> {
    const taskId = this.nextId++;
    return this.run<bigint[]>({ type: "search", taskId, clockIndex, conditions }, onProgress);
  }

  dispose() {
    this.worker.terminate();
  }
}
