import { useMemo, useRef, useState } from 'react';
import './styles.css';
import { SignalBrowser } from './components/SignalBrowser';
import { WaveformCanvas, type DisplayState } from './components/WaveformCanvas';
import { SearchPanel } from './components/SearchPanel';
import { useVcdWorker } from './workers/useVcdWorker';
import { fitWindow } from './vcd/timeWindow';
import type { SearchHit, TimedSignal } from './vcd/types';
import { bigAbsDiff, formatTime, valueAt } from './vcd/waveform';

const EXAMPLE_PATH = '/example.vcd';

export default function App() {
  const worker = useVcdWorker();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [radixes, setRadixes] = useState<Record<string, 2 | 16>>({});
  const [view, setView] = useState(() => ({ startN: 0n, spanN: 100_000_000n, width: 900 }));
  const [cursors, setCursors] = useState<[bigint, bigint]>([10n, 30n]);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searchSignature, setSearchSignature] = useState('');
  const [resultSignature, setResultSignature] = useState('');
  const [notice, setNotice] = useState('请导入或载入示例 VCD。');
  const [loadedKey, setLoadedKey] = useState<unknown>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const data = worker.data;
  const timescale = data?.timescale ? `${data.timescale.number}${data.timescale.unit}` : null;

  const selectedSignals = useMemo<TimedSignal[]>(() =>
    selectedIds.map((id) => data?.signals.get(id)).filter((signal): signal is TimedSignal => Boolean(signal)),
    [data, selectedIds]
  );
  const rows: DisplayState[] = selectedSignals.map((signal) => ({ signal, radix: radixes[signal.id] ?? 2 }));

  if (data && loadedKey !== data) {
    setLoadedKey(data);
    const firstIds = [...data.signals.keys()].slice(0, 6);
    setSelectedIds(firstIds);
    setHits(null);
    setResultSignature('');
    setSearchSignature('');
    setView((old) => fitWindow(data.endTime, old.width));
    setCursors([0n, data.endTime / 2n]);
    setNotice(`已导入：${data.signals.size} 个唯一标识码，结束时间 ${data.endTime}${timescale ? ` ${timescale}` : ''}`);
  }

  const importText = (name: string, text: string) => {
    setNotice(`正在解析 ${name}…`);
    worker.parseText(name, text);
  };

  const onFile = async (file: File | undefined) => {
    if (file) importText(file.name, await file.text());
  };

  const loadExample = async () => {
    const response = await fetch(EXAMPLE_PATH);
    importText('example.vcd', await response.text());
  };

  const move = (id: string, delta: number) => setSelectedIds((old) => {
    const index = old.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= old.length) return old;
    const next = [...old];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  const performSearch = async (clockId: string, conditions: Array<{ signalId: string; pattern: string }>) => {
    const signature = JSON.stringify({ clockId, conditions });
    setSearchSignature(signature);
    try {
      const found = await worker.searchMatches(clockId, conditions) as SearchHit[];
      setHits(found);
      setResultSignature(signature);
    } catch (error) {
      worker.setError(error instanceof Error ? error.message : String(error));
    }
  };

  const progressText = worker.progress?.phase === 'parse'
    ? `解析 ${worker.progress.loaded}/${worker.progress.total} 行`
    : worker.progress?.phase === 'search' ? `检索 ${worker.progress.scanned}/${worker.progress.total} 个时钟事件` : '';
  const progressPercent = worker.progress?.phase === 'parse'
    ? worker.progress.loaded / Math.max(1, worker.progress.total) * 100
    : worker.progress?.phase === 'search' ? worker.progress.scanned / Math.max(1, worker.progress.total) * 100 : 0;
  const cursorInfo = rows.map(({ signal }) => ({ signal, a: valueAt(signal, cursors[0]), b: valueAt(signal, cursors[1]) }));

  return (
    <div className="app-shell">
      <header>
        <div>
          <h1>离线数字电路波形调试</h1>
          <p>{notice} {worker.error && <strong className="error">解析失败：{worker.error}；旧数据继续保留。</strong>}</p>
        </div>
        <div className="actions">
          <input ref={inputRef} type="file" accept=".vcd,text/plain" hidden onChange={(event) => onFile(event.target.files?.[0])} />
          <button onClick={() => inputRef.current?.click()}>导入 VCD</button>
          <button onClick={loadExample}>载入示例</button>
          <button disabled={!data} onClick={() => data && setView((old) => fitWindow(data.endTime, old.width))}>全局适配</button>
          <button disabled={!worker.busy} onClick={worker.cancel}>取消任务</button>
        </div>
      </header>
      {progressText && <div className="progress-bar"><span style={{ width: progressPercent + '%' }} /></div>}
      <main>
        {data
          ? <SignalBrowser roots={data.roots} signals={data.signals} selectedIds={selectedIds} onAdd={(id) => setSelectedIds((old) => old.includes(id) ? old : [...old, id])} search={worker.searchSignals} />
          : <section className="panel browser"><h2>层级与信号</h2><p className="muted">导入后显示。</p></section>}
        <section className="panel waveform-panel">
          <div className="waveform-toolbar"><h2>波形</h2><span className="muted">滚轮缩放，拖空白平移，拖 C1/C2 游标定位</span></div>
          <div className="selected-list">{rows.map(({ signal, radix }, index) => (
            <div className="signal-strip" key={signal.id}>
              <div className="signal-label"><span title={signal.aliases.join('\n')}>{signal.path}{signal.aliases.length > 1 ? ` +${signal.aliases.length - 1} 别名` : ''}</span><small>{signal.type}[{signal.width}]</small></div>
              <div className="signal-controls">
                <button onClick={() => move(signal.id, -1)} disabled={index === 0}>↑</button>
                <button onClick={() => move(signal.id, 1)} disabled={index === rows.length - 1}>↓</button>
                <button onClick={() => setRadixes((old) => ({ ...old, [signal.id]: radix === 2 ? 16 : 2 }))}>{radix === 2 ? 'BIN' : 'HEX'}</button>
                <button onClick={() => setSelectedIds((old) => old.filter((item) => item !== signal.id))}>移除</button>
              </div>
            </div>
          ))}</div>
          <div className="canvas-wrap">{rows.length
            ? <WaveformCanvas rows={rows} view={view} cursors={cursors} onViewChange={setView} onCursorChange={(index, time) => setCursors((old) => index === 0 ? [time, old[1]] : [old[0], time])} />
            : <p className="empty">从左侧添加信号。</p>}</div>
          <table className="cursor-table">
            <thead><tr><th>信号</th><th>C1 @ {formatTime(cursors[0], timescale)}</th><th>C2 @ {formatTime(cursors[1], timescale)}</th></tr></thead>
            <tbody>{cursorInfo.map(({ signal, a, b }) => <tr key={signal.id}><td>{signal.path}</td><td className={a.includes('x') ? 'value-x' : a.includes('z') ? 'value-z' : ''}>{a}</td><td className={b.includes('x') ? 'value-x' : b.includes('z') ? 'value-z' : ''}>{b}</td></tr>)}</tbody>
          </table>
          <p className="time-diff">时间差：{bigAbsDiff(cursors[0], cursors[1]).toString()}{timescale ? ` ${timescale}` : ''}</p>
        </section>
        {data
          ? <SearchPanel signals={[...data.signals.values()]} selectedIds={selectedIds} busy={worker.busy} hits={hits} stale={searchSignature !== resultSignature} timescale={timescale} onSearch={performSearch} onJump={(time) => setView((old) => ({ ...old, startN: time * 1_000_000n - old.spanN / 2n }))} />
          : <section className="panel search-panel"><h2>边沿联合检索</h2><p className="muted">导入后可用。</p></section>}
      </main>
    </div>
  );
}
