export const TIME_DENOMINATOR = 1_000_000n;

export interface ViewWindow {
  startN: bigint;
  spanN: bigint;
  width: number;
}

export function fitWindow(endTime: bigint, width: number): ViewWindow {
  const span = endTime + 2n;
  return { startN: 0n, spanN: span * TIME_DENOMINATOR, width };
}

export function windowStart(view: ViewWindow): bigint {
  return view.startN / TIME_DENOMINATOR;
}

export function windowEnd(view: ViewWindow): bigint {
  return (view.startN + view.spanN + TIME_DENOMINATOR - 1n) / TIME_DENOMINATOR;
}

export function timeToX(time: bigint, view: ViewWindow): number {
  const numerator = (time * TIME_DENOMINATOR - view.startN) * BigInt(Math.max(1, Math.round(view.width)));
  const x = numerator / view.spanN;
  return Math.max(-100, Math.min(view.width + 100, Number(x)));
}

export function xToTime(x: number, view: ViewWindow): bigint {
  const wx = BigInt(Math.max(0, Math.min(view.width, Math.round(x))));
  const scaled = view.startN + (wx * view.spanN) / BigInt(Math.max(1, Math.round(view.width)));
  return scaled / TIME_DENOMINATOR;
}

export function zoomAt(view: ViewWindow, x: number, factorIn: boolean): ViewWindow {
  const anchor = xToTime(x, view);
  const numerator = factorIn ? 8n : 12n;
  const denominator = 10n;
  const anchorN = anchor * TIME_DENOMINATOR;
  const newSpan = (view.spanN * numerator) / denominator;
  const oldOffset = anchorN - view.startN;
  let newStart = anchorN - (oldOffset * numerator) / denominator;
  if (newStart < 0n) newStart = 0n;
  return { ...view, startN: newStart, spanN: newSpan < TIME_DENOMINATOR ? TIME_DENOMINATOR : newSpan };
}

export function panBy(view: ViewWindow, dxPixels: number): ViewWindow {
  const delta = (BigInt(Math.round(-dxPixels)) * view.spanN) / BigInt(Math.max(1, Math.round(view.width)));
  const start = view.startN + delta;
  return { ...view, startN: start < 0n ? 0n : start };
}

export function centerOn(time: bigint, view: ViewWindow): ViewWindow {
  return { ...view, startN: time * TIME_DENOMINATOR - view.spanN / 2n };
}

export function niceStep(view: ViewWindow, targetPixels: number): bigint {
  const width = BigInt(Math.max(1, Math.round(view.width)));
  const minStep = (view.spanN * BigInt(Math.max(1, Math.round(targetPixels))) + width * TIME_DENOMINATOR - 1n) / (width * TIME_DENOMINATOR);
  let step = 1n;
  while (step < minStep) {
    if (step * 2n >= minStep) return step * 2n;
    if (step * 5n >= minStep) return step * 5n;
    step *= 10n;
  }
  return step;
}
