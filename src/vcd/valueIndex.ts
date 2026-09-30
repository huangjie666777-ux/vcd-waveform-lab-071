import { Change } from "./types";

/** index of the last change with t <= time, or -1 */
export function indexAt(changes: Change[], time: bigint): number {
  let lo = 0;
  let hi = changes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (changes[mid].t <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/** value effective at `time`; all-x before the first assignment */
export function valueAt(changes: Change[], time: bigint, width: number): string {
  const idx = indexAt(changes, time);
  if (idx < 0) return "x".repeat(width);
  return changes[idx].v;
}

export interface RangeView {
  /** index of the change carried in from the left edge, -1 if none (all-x) */
  initialIndex: number;
  /** changes with start < t <= end */
  events: Change[];
}

/** Locate events inside (start, end] via binary search; never expands per time unit. */
export function changesInRange(changes: Change[], start: bigint, end: bigint): RangeView {
  const initialIndex = indexAt(changes, start);
  let lo = initialIndex + 1;
  let hi = changes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (changes[mid].t <= end) lo = mid + 1;
    else hi = mid;
  }
  return { initialIndex, events: changes.slice(initialIndex + 1, lo) };
}
