import { useEffect, useRef } from 'react';
import type { TimedSignal } from '../vcd/types';
import { timeToX, windowEnd, windowStart, xToTime, type ViewWindow } from '../vcd/timeWindow';
import { toDisplay, visibleChanges } from '../vcd/waveform';

export interface DisplayState {
  signal: TimedSignal;
  radix: 2 | 16;
}

interface Props {
  rows: DisplayState[];
  view: ViewWindow;
  cursors: [bigint, bigint];
  onViewChange: (view: ViewWindow) => void;
  onCursorChange: (index: 0 | 1, time: bigint) => void;
}

const ROW_HEIGHT = 54;
const HEADER_HEIGHT = 34;
const COLORS = {
  bg: '#0f172a',
  grid: '#243047',
  text: '#dbeafe',
  muted: '#94a3b8',
  one: '#38bdf8',
  zero: '#64748b',
  x: '#f59e0b',
  z: '#a78bfa',
  bus: '#22c55e',
  cursorA: '#fb7185',
  cursorB: '#facc15',
};

export function WaveformCanvas({ rows, view, cursors, onViewChange, onCursorChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ mode: 'pan' | 'cursor'; cursor?: 0 | 1; x: number; view: ViewWindow } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const resize = new ResizeObserver(() => {
      const rect = parent.getBoundingClientRect();
      canvas.width = Math.max(100, rect.width) * devicePixelRatio;
      canvas.height = Math.max(HEADER_HEIGHT + rows.length * ROW_HEIGHT, 120) * devicePixelRatio;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${HEADER_HEIGHT + rows.length * ROW_HEIGHT}px`;
      draw();
    });
    resize.observe(parent);
    return () => resize.disconnect();
  });

  useEffect(() => { draw(); });

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = devicePixelRatio;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;

    for (let y = HEADER_HEIGHT; y <= height; y += ROW_HEIGHT) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const start = windowStart(view);
    const end = windowEnd(view);
    rows.forEach((row, index) => drawSignal(ctx, row, index, start, end, width));
    cursors.forEach((time, index) => drawCursor(ctx, time, width, height, index === 0 ? COLORS.cursorA : COLORS.cursorB, `C${index + 1}`));
  }

  function drawSignal(ctx: CanvasRenderingContext2D, row: DisplayState, index: number, start: bigint, end: bigint, width: number) {
    const top = HEADER_HEIGHT + index * ROW_HEIGHT;
    const center = top + ROW_HEIGHT / 2;
    const { leadValue, items } = visibleChanges(row.signal, start, end);
    const timeline: Array<{ t: bigint; v: string }> = [{ t: start, v: leadValue }, ...items.filter((change) => change.t > start && change.t < end)];
    if (items.length && items[items.length - 1].t === end) timeline.push(items[items.length - 1]);

    for (let i = 0; i < timeline.length; i += 1) {
      const current = timeline[i];
      const nextTime = i + 1 < timeline.length ? timeline[i + 1].t : end;
      const x1 = timeToX(current.t, view);
      const x2 = timeToX(nextTime, view);
      const isScalar = row.signal.width === 1;
      if (isScalar) drawScalar(ctx, current.v, x1, x2, center);
      else drawBus(ctx, row, current.v, x1, x2, top + 10, top + ROW_HEIGHT - 10);
    }
  }

  function drawScalar(ctx: CanvasRenderingContext2D, value: string, x1: number, x2: number, center: number) {
    const y = value === '1' ? center - 12 : center + 12;
    const color = value === '1' ? COLORS.one : value === '0' ? COLORS.zero : value === 'x' ? COLORS.x : COLORS.z;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(value, Math.min(x1 + 4, x2 - 14), y - 5);
  }

  function drawBus(ctx: CanvasRenderingContext2D, row: DisplayState, value: string, x1: number, x2: number, top: number, bottom: number) {
    const unknown = value.includes('x') || value.includes('z');
    ctx.strokeStyle = value.includes('x') ? COLORS.x : value.includes('z') ? COLORS.z : COLORS.bus;
    ctx.fillStyle = unknown ? 'rgba(148,163,184,0.12)' : 'rgba(34,197,94,0.10)';
    const width = Math.max(1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x1 + 4, top + 6);
    ctx.lineTo(x1, top + 12);
    ctx.lineTo(x1, bottom - 12);
    ctx.lineTo(x1 + 4, bottom - 6);
    ctx.lineTo(Math.max(x1 + 4, x2 - 4), bottom - 6);
    ctx.lineTo(x2, bottom - 12);
    ctx.lineTo(x2, top + 12);
    ctx.lineTo(Math.max(x1 + 4, x2 - 4), top + 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    const label = toDisplay(value, row.radix, row.signal.width);
    if (x2 - x1 > label.length * 8 + 10) ctx.fillText(label, x1 + 8, (top + bottom) / 2 + 4);
  }

  function drawCursor(ctx: CanvasRenderingContext2D, time: bigint, width: number, height: number, color: string, label: string) {
    const x = timeToX(time, view);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.fillRect(x - 12, 0, 24, 18);
    ctx.fillStyle = '#0f172a';
    ctx.fillText(label, x - 8, 13);
    ctx.fillStyle = color;
    ctx.fillText(time.toString(), Math.min(x + 6, width - 90), 27);
  }

  function pointerPosition(event: { clientX: number }) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return event.clientX - rect.left;
  }

  function nearestCursor(x: number): 0 | 1 | null {
    const distances = cursors.map((time) => Math.abs(timeToX(time, view) - x));
    return distances[0] <= 7 ? 0 : distances[1] <= 7 ? 1 : null;
  }

  return <canvas
    ref={canvasRef}
    onWheel={(event) => { event.preventDefault(); onViewChange({ ...view, ...{} }); onViewChange(zoomView(event)); }}
    onPointerDown={(event) => {
      const x = pointerPosition(event);
      const cursor = nearestCursor(x);
      if (cursor !== null) drag.current = { mode: 'cursor', cursor, x, view };
      else drag.current = { mode: 'pan', x, view };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={(event) => {
      if (!drag.current) return;
      const x = pointerPosition(event);
      if (drag.current.mode === 'cursor') onCursorChange(drag.current.cursor!, xToTime(x, view));
      else onViewChange(panView(drag.current.view, x - drag.current.x));
    }}
    onPointerUp={() => { drag.current = null; }}
  />;

  function zoomView(event: React.WheelEvent): ViewWindow {
    const x = pointerPosition(event);
    const factorIn = event.deltaY < 0;
    const anchor = xToTime(x, view);
    const numerator = factorIn ? 8n : 12n;
    const denominator = 10n;
    const anchorN = anchor * 1_000_000n;
    const newSpan = (view.spanN * numerator) / denominator;
    const oldOffset = anchorN - view.startN;
    let start = anchorN - (oldOffset * numerator) / denominator;
    if (start < 0n) start = 0n;
    return { ...view, startN: start, spanN: newSpan < 1_000_000n ? 1_000_000n : newSpan };
  }

  function panView(original: ViewWindow, dx: number): ViewWindow {
    const delta = (BigInt(Math.round(dx)) * original.spanN) / BigInt(Math.max(1, Math.round(original.width)));
    const start = original.startN + delta;
    return { ...original, startN: start < 0n ? 0n : start };
  }
}
