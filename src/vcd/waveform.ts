import type { TimedSignal } from './types';

export const X_VALUE = (width: number) => 'x'.repeat(width);

export function lowerBound(changes: TimedSignal['changes'], time: bigint): number {
  let lo = 0;
  let hi = changes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (changes[mid].t < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function valueAt(signal: TimedSignal, time: bigint): string {
  const index = lowerBound(signal.changes, time);
  if (index < signal.changes.length && signal.changes[index].t === time) return signal.changes[index].v;
  if (index > 0) return signal.changes[index - 1].v;
  return X_VALUE(signal.width);
}

export function visibleChanges(signal: TimedSignal, start: bigint, end: bigint) {
  const first = lowerBound(signal.changes, start);
  let begin = first;
  let leadValue = X_VALUE(signal.width);
  if (first > 0) {
    begin = first - 1;
    leadValue = signal.changes[first - 1].v;
  }
  let stop = lowerBound(signal.changes, end);
  if (stop < signal.changes.length && signal.changes[stop].t === end) stop += 1;
  return { leadValue, items: signal.changes.slice(begin, stop) };
}

export function toDisplay(value: string, radix: 2 | 16, width: number): string {
  if (radix === 2) return value;
  if ([...value].some((bit) => bit === 'x')) return 'x'.repeat(Math.ceil(width / 4));
  if ([...value].some((bit) => bit === 'z')) return 'z'.repeat(Math.ceil(width / 4));
  const groups: string[] = [];
  const pad = (4 - (width % 4)) % 4;
  const bits = '0'.repeat(pad) + value;
  for (let i = 0; i < bits.length; i += 4) groups.push(parseInt(bits.slice(i, i + 4), 2).toString(16));
  return groups.join('').toUpperCase();
}

export function bigAbsDiff(a: bigint, b: bigint): bigint {
  return a >= b ? a - b : b - a;
}

export function formatTime(time: bigint, scale: string | null): string {
  return scale ? `${time} ${scale}` : time.toString();
}
