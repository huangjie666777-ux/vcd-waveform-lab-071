import { useMemo, useState } from "react";
import { VcdFile } from "../vcd/types";
import { Condition } from "../vcd/search";
import { formatTime } from "../vcd/format";

export interface SearchState {
  hits: bigint[] | null;
  stale: boolean;
  running: boolean;
  progress: { done: number; total: number } | null;
  error: string | null;
}

export function SearchPanel(props: {
  vcd: VcdFile;
  state: SearchState;
  onRun: (clockIndex: number, conditions: Condition[]) => void;
  onCancel: () => void;
  onJump: (t: bigint) => void;
  onDirty: () => void;
}) {
  const { vcd, state } = props;
  const oneBitVars = useMemo(() => vcd.vars.filter((v) => v.width === 1), [vcd]);
  const [clockIndex, setClockIndex] = useState<number>(oneBitVars[0]?.index ?? 0);
  const [conds, setConds] = useState<{ varIndex: number; pattern: string }[]>([]);
  const clockValid = oneBitVars.some((v) => v.index === clockIndex);
  const effectiveClock = clockValid ? clockIndex : (oneBitVars[0]?.index ?? 0);

  const markDirtyAnd = (next: { varIndex: number; pattern: string }[]) => {
    setConds(next);
    props.onDirty();
  };

  return (
    <div className="searchpanel">
      <div className="row">
        <b>条件检索</b>
        <span className="hint">时钟(0→1 边沿采样):</span>
        <select value={effectiveClock} onChange={(e) => setClockIndex(Number(e.target.value))}>
          {oneBitVars.map((v) => (
            <option key={v.index} value={v.index}>
              {v.fullName}
            </option>
          ))}
        </select>
        <button
          onClick={() =>
            markDirtyAnd([...conds, { varIndex: vcd.vars[0]?.index ?? 0, pattern: "" }])
          }
        >
          + 条件
        </button>
        <button
          disabled={state.running || conds.length === 0}
          onClick={() => props.onRun(effectiveClock, conds)}
        >
          开始检索
        </button>
        {state.running && <button onClick={props.onCancel}>取消</button>}
        {state.progress && state.running && (
          <span className="progress">
            <div style={{ width: `${(100 * state.progress.done) / Math.max(1, state.progress.total)}%` }} />
          </span>
        )}
        {state.stale && state.hits && <span className="stale">条件已修改，结果已失效，请重新检索</span>}
        {state.error && <span className="error">{state.error}</span>}
      </div>
      {conds.map((c, i) => {
        const v = vcd.vars[c.varIndex];
        return (
          <div className="row" key={i}>
            <span>=</span>
            <select
              value={c.varIndex}
              onChange={(e) => {
                const next = [...conds];
                next[i] = { ...next[i], varIndex: Number(e.target.value) };
                markDirtyAnd(next);
              }}
            >
              {vcd.vars.map((sv) => (
                <option key={sv.index} value={sv.index}>
                  {sv.fullName} [{sv.width}]
                </option>
              ))}
            </select>
            <input
              style={{ fontFamily: "Consolas, monospace" }}
              size={Math.max(8, (v?.width ?? 8) + 2)}
              placeholder={`${v?.width ?? "?"} 位 0/1/x/z`}
              value={c.pattern}
              onChange={(e) => {
                const next = [...conds];
                next[i] = { ...next[i], pattern: e.target.value };
                markDirtyAnd(next);
              }}
            />
            <button onClick={() => markDirtyAnd(conds.filter((_, j) => j !== i))}>删除</button>
          </div>
        );
      })}
      {state.hits && !state.stale && (
        <div className="hits">
          {state.hits.length === 0 ? (
            <span className="hint">无命中</span>
          ) : (
            <>
              <span className="hint">命中 {state.hits.length} 次：</span>
              {state.hits.slice(0, 300).map((t, i) => (
                <button key={i} onClick={() => props.onJump(t)}>
                  {formatTime(t, vcd.timescale)}
                </button>
              ))}
              {state.hits.length > 300 && <span className="hint">…仅显示前 300 条</span>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
