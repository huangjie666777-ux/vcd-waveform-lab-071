import { VcdFile } from "./types";
import { valueAt } from "./valueIndex";

export interface Condition {
  varIndex: number;
  /** four-state bit string, exactly the signal width; x/z compared literally */
  pattern: string;
}

export function validatePattern(pattern: string, width: number): string | null {
  const p = pattern.trim().toLowerCase();
  if (!/^[01xz]+$/.test(p)) return "条件只能包含 0/1/x/z";
  if (p.length !== width) return `条件位宽 ${p.length} 与信号位宽 ${width} 不一致`;
  return null;
}

/** 0 -> 1 rising edges; value before the first assignment is x */
export function risingEdges(changes: { t: bigint; v: string }[]): bigint[] {
  const out: bigint[] = [];
  let prev = "x";
  for (const c of changes) {
    if (prev === "0" && c.v === "1") out.push(c.t);
    prev = c.v;
  }
  return out;
}

export interface SearchOptions {
  onProgress?: (done: number, total: number) => void;
  shouldCancel?: () => boolean;
}

/**
 * Sample all condition signals at each rising edge of the clock, using values
 * after every update at that timestamp (the index stores last-wins per time).
 */
export async function searchRisingEdges(
  vcd: VcdFile,
  clockIndex: number,
  conditions: Condition[],
  opts: SearchOptions = {},
): Promise<bigint[]> {
  const clock = vcd.vars[clockIndex];
  if (!clock || clock.width !== 1) throw new Error("时钟必须是 1 位信号");
  for (const c of conditions) {
    const v = vcd.vars[c.varIndex];
    if (!v) throw new Error("条件引用了不存在的信号");
    const err = validatePattern(c.pattern, v.width);
    if (err) throw new Error(v.fullName + ": " + err);
  }
  const edges = risingEdges(vcd.changes[clockIndex]);
  const hits: bigint[] = [];
  for (let k = 0; k < edges.length; k++) {
    if (k % 4096 === 0) {
      if (opts.shouldCancel?.()) throw new Error("cancelled");
      opts.onProgress?.(k, edges.length);
      if (k > 0) await new Promise((r) => setTimeout(r, 0));
    }
    const t = edges[k];
    let ok = true;
    for (const c of conditions) {
      const v = vcd.vars[c.varIndex];
      if (valueAt(vcd.changes[c.varIndex], t, v.width) !== c.pattern.trim().toLowerCase()) {
        ok = false;
        break;
      }
    }
    if (ok) hits.push(t);
  }
  opts.onProgress?.(edges.length, edges.length);
  return hits;
}
