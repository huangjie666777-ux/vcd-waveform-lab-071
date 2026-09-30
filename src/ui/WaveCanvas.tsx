import { useEffect, useRef } from "react";
import { VcdFile } from "../vcd/types";
import { changesInRange } from "../vcd/valueIndex";
import { formatBits, formatTime } from "../vcd/format";

export interface ViewRange {
  start: bigint;
  end: bigint;
}

export interface SelectedSignal {
  varIndex: number;
  format: "bin" | "hex";
}

export const ROW_H = 34;
const RULER_H = 26;

const COLOR_DEFINED = "#4ec96b";
const COLOR_X = "#e05555";
const COLOR_Z = "#e0a040";
const COLOR_GRID = "#33343a";

function stateColor(v: string): string {
  if (v.includes("x")) return COLOR_X;
  if (v.includes("z")) return COLOR_Z;
  return COLOR_DEFINED;
}

/** 10^k as bigint */
function pow10(k: number): bigint {
  return 10n ** BigInt(k);
}

function niceStep(span: bigint): bigint {
  const digits = span.toString().length;
  const base = pow10(Math.max(0, digits - 1));
  for (const m of [1n, 2n, 5n, 10n]) {
    const step = base * m;
    if (span / step <= 8n) return step;
  }
  return base * 10n;
}

export function WaveCanvas(props: {
  vcd: VcdFile;
  signals: SelectedSignal[];
  view: ViewRange;
  onViewChange: (v: ViewRange) => void;
  cursorA: bigint | null;
  cursorB: bigint | null;
  onCursor: (which: "a" | "b", t: bigint) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; moved: boolean; shift: boolean } | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const { view } = props;
  const span = view.end - view.start;

  const timeToPx = (t: bigint, width: number) => Number(t - view.start) * (width / Number(span));
  const pxToTime = (px: number, width: number) =>
    view.start + BigInt(Math.round((px * Number(span)) / width));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement!;
    const dpr = window.devicePixelRatio || 1;
    const cssW = parent.clientWidth;
    const cssH = parent.clientHeight;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.font = "11px Consolas, monospace";

    const p = propsRef.current;
    const t2x = (t: bigint) => timeToPx(t, cssW);

    // ruler
    ctx.fillStyle = "#26272c";
    ctx.fillRect(0, 0, cssW, RULER_H);
    const step = niceStep(span);
    ctx.strokeStyle = COLOR_GRID;
    ctx.fillStyle = "#999";
    ctx.textAlign = "left";
    const first = (view.start / step) * step;
    for (let t = first; t <= view.end; t += step) {
      if (t < view.start) continue;
      const x = t2x(t);
      ctx.beginPath();
      ctx.moveTo(x, RULER_H - 8);
      ctx.lineTo(x, RULER_H);
      ctx.stroke();
      ctx.fillText(formatTime(t, p.vcd.timescale), x + 3, RULER_H - 10);
      // vertical grid line
      ctx.strokeStyle = "#2a2b30";
      ctx.beginPath();
      ctx.moveTo(x, RULER_H);
      ctx.lineTo(x, cssH);
      ctx.stroke();
      ctx.strokeStyle = COLOR_GRID;
    }

    // rows
    p.signals.forEach((sig, row) => {
      const v = p.vcd.vars[sig.varIndex];
      if (!v) return;
      const top = RULER_H + row * ROW_H;
      const hi = top + 6;
      const lo = top + ROW_H - 6;
      const mid = (hi + lo) / 2;
      ctx.strokeStyle = "#2a2b30";
      ctx.beginPath();
      ctx.moveTo(0, top + ROW_H);
      ctx.lineTo(cssW, top + ROW_H);
      ctx.stroke();

      const changes = p.vcd.changes[sig.varIndex];
      const { initialIndex, events } = changesInRange(changes, view.start, view.end);
      // build segments covering [view.start, view.end]
      const segs: { t0: bigint; t1: bigint; val: string }[] = [];
      let curVal = initialIndex >= 0 ? changes[initialIndex].v : "x".repeat(v.width);
      let curT = view.start;
      for (const e of events) {
        segs.push({ t0: curT, t1: e.t, val: curVal });
        curVal = e.v;
        curT = e.t;
      }
      segs.push({ t0: curT, t1: view.end, val: curVal });

      if (v.width === 1) {
        for (const s of segs) {
          const x0 = t2x(s.t0);
          const x1 = t2x(s.t1);
          const val = s.val;
          if (val === "x") {
            ctx.fillStyle = "rgba(224,85,85,0.25)";
            ctx.fillRect(x0, hi, Math.max(1, x1 - x0), lo - hi);
            ctx.strokeStyle = COLOR_X;
            ctx.beginPath();
            ctx.moveTo(x0, hi);
            ctx.lineTo(x1, hi);
            ctx.moveTo(x0, lo);
            ctx.lineTo(x1, lo);
            ctx.stroke();
          } else if (val === "z") {
            ctx.strokeStyle = COLOR_Z;
            ctx.beginPath();
            ctx.moveTo(x0, mid);
            ctx.lineTo(x1, mid);
            ctx.stroke();
          } else {
            ctx.strokeStyle = COLOR_DEFINED;
            const y = val === "1" ? hi : lo;
            ctx.beginPath();
            ctx.moveTo(x0, y);
            ctx.lineTo(x1, y);
            ctx.stroke();
          }
          // transition edge
          if (s.t0 !== view.start && x1 > x0) {
            ctx.strokeStyle = "#777";
            ctx.beginPath();
            ctx.moveTo(x0, hi);
            ctx.lineTo(x0, lo);
            ctx.stroke();
          }
        }
      } else {
        for (const s of segs) {
          const x0 = t2x(s.t0);
          const x1 = t2x(s.t1);
          if (x1 - x0 < 1.5) continue;
          const slant = Math.min(7, (x1 - x0) / 4);
          const color = stateColor(s.val);
          ctx.beginPath();
          ctx.moveTo(x0 + slant, hi);
          ctx.lineTo(x1 - slant, hi);
          ctx.lineTo(x1, mid);
          ctx.lineTo(x1 - slant, lo);
          ctx.lineTo(x0 + slant, lo);
          ctx.lineTo(x0, mid);
          ctx.closePath();
          ctx.fillStyle = color === COLOR_DEFINED ? "rgba(78,201,107,0.12)" : color === COLOR_X ? "rgba(224,85,85,0.18)" : "rgba(224,160,64,0.15)";
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.stroke();
          const label = formatBits(s.val, sig.format);
          const tw = ctx.measureText(label).width;
          if (x1 - x0 - 2 * slant > tw + 6) {
            ctx.fillStyle = "#ddd";
            ctx.textAlign = "center";
            ctx.fillText(label, (x0 + x1) / 2, mid + 4);
            ctx.textAlign = "left";
          }
        }
      }
    });

    // cursors
    const drawCursor = (t: bigint | null, color: string, tag: string) => {
      if (t == null || t < view.start || t > view.end) return;
      const x = t2x(t);
      ctx.strokeStyle = color;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, cssH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.fillText(tag, x + 3, 10);
    };
    drawCursor(p.cursorA, "#e8d44d", "A");
    drawCursor(p.cursorB, "#4dc9e8", "B");
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = propsRef.current;
      const rect = canvas.getBoundingClientRect();
      const frac = (e.clientX - rect.left) / rect.width;
      const cur = p.view.end - p.view.start;
      const factor = e.deltaY > 0 ? 6 : -1; // out / in
      let next = factor > 0 ? (cur * 6n) / 5n : (cur * 5n) / 6n;
      if (next < 4n) next = 4n;
      const anchor = p.view.start + BigInt(Math.floor(Number(cur) * frac));
      let ns = anchor - BigInt(Math.floor(Number(next) * frac));
      if (ns < 0n) ns = 0n;
      p.onViewChange({ start: ns, end: ns + next });
    };
    const onDown = (e: MouseEvent) => {
      dragRef.current = { x: e.clientX, moved: false, shift: e.shiftKey };
    };
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.x;
      if (!d.moved && Math.abs(dx) > 3) d.moved = true;
      if (d.moved) {
        const p = propsRef.current;
        const rect = canvas.getBoundingClientRect();
        const cur = p.view.end - p.view.start;
        const dt = BigInt(Math.round((-dx * Number(cur)) / rect.width));
        let ns = p.view.start + dt;
        if (ns < 0n) ns = 0n;
        p.onViewChange({ start: ns, end: ns + cur });
        d.x = e.clientX;
      }
    };
    const onUp = (e: MouseEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d || d.moved) return;
      const p = propsRef.current;
      const rect = canvas.getBoundingClientRect();
      const t = p.view.start + BigInt(Math.round(((e.clientX - rect.left) * Number(p.view.end - p.view.start)) / rect.width));
      p.onCursor(d.shift ? "b" : "a", t);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <div className="canvascol">
      <canvas ref={canvasRef} className="wavecanvas" />
    </div>
  );
}
