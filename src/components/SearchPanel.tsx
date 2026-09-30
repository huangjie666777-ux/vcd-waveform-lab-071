import { useMemo, useState } from 'react';
import type { SearchHit, TimedSignal } from '../vcd/types';

interface Props {
  signals: TimedSignal[];
  selectedIds: string[];
  busy: boolean;
  hits: SearchHit[] | null;
  stale: boolean;
  timescale: string | null;
  onSearch: (clockId: string, conditions: Array<{ signalId: string; pattern: string }>) => void;
  onJump: (time: bigint) => void;
}

export function SearchPanel(props: Props) {
  const { signals, selectedIds, busy, hits, stale, timescale, onSearch, onJump } = props;
  const clocks = signals.filter((signal) => signal.width === 1);
  const [clockId, setClockId] = useState('');
  const [conditionMap, setConditionMap] = useState<Record<string, string>>({});
  const effectiveClock = clockId || clocks[0]?.id || '';
  const conditions = useMemo(() => selectedIds
    .filter((id) => id !== effectiveClock)
    .map((id) => {
      const signal = signals.find((item) => item.id === id);
      return { signalId: id, pattern: conditionMap[id] ?? 'x'.repeat(signal?.width ?? 1) };
    }), [clockId, conditionMap, selectedIds, signals]);

  const submit = () => {
    const requested = conditions.map((item) => ({ signalId: item.signalId, pattern: conditionMap[item.signalId] ?? item.pattern }));
    onSearch(effectiveClock, requested);
  };

  return (
    <section className="panel search-panel">
      <h2>边沿联合检索</h2>
      <label>采样时钟（0到1边沿）</label>
      <select value={effectiveClock} onChange={(event) => setClockId(event.target.value)}>
        <option value="">选择一位信号</option>
        {clocks.map((signal) => <option key={signal.id} value={signal.id}>{signal.path}</option>)}
      </select>
      <div className="conditions">
        {selectedIds.map((id) => {
          const signal = signals.find((item) => item.id === id);
          if (!signal || id === effectiveClock) return null;
          const value = conditionMap[id] ?? 'x'.repeat(signal.width);
          return (
            <label key={id} className="condition-row">
              <span title={signal.path}>{signal.name} [{signal.width}]</span>
              <input maxLength={signal.width} value={value} onChange={(event) => setConditionMap((old) => ({ ...old, [id]: event.target.value.replace(/[^01xzXZ]/g, '').toLowerCase() }))} />
            </label>
          );
        })}
      </div>
      <button disabled={!effectiveClock || busy} onClick={submit}>检索</button>
      <div className="hits">
        <h3>命中结果</h3>
        {stale && <p className="warning">条件已修改，旧结果已失效，请重新检索。</p>}
        {!hits && !stale && <p className="muted">尚未检索。</p>}
        {hits && !stale && (hits.length ? (
          <ol>{hits.map((hit) => <li key={hit.t.toString()}><button className="link" onClick={() => onJump(hit.t)}>{hit.t.toString()}{timescale ? ' ' + timescale : ''}</button></li>)}</ol>
        ) : <p className="warning">无命中。</p>)}
      </div>
    </section>
  );
}
