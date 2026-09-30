import { useCallback, useEffect, useRef, useState } from "react";
import { VcdFile } from "../vcd/types";
import { VcdClient, TaskHandle } from "../worker/client";
import { HierarchyTree } from "./HierarchyTree";
import { SelectedSignal, ViewRange, WaveCanvas, ROW_H } from "./WaveCanvas";
import { SearchPanel, SearchState } from "./SearchPanel";
import { Condition } from "../vcd/search";
import { formatBits, formatTime } from "../vcd/format";
import { valueAt } from "../vcd/valueIndex";
import { SAMPLE_VCD } from "../sample";

export function App() {
  const clientRef = useRef<VcdClient | null>(null);
  if (!clientRef.current) clientRef.current = new VcdClient();
  const parseTask = useRef<TaskHandle<VcdFile> | null>(null);
  const searchTask = useRef<TaskHandle<bigint[]> | null>(null);

  const [vcd, setVcd] = useState<VcdFile | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseProgress, setParseProgress] = useState<{ done: number; total: number } | null>(null);
  const [signals, setSignals] = useState<SelectedSignal[]>([]);
  const [view, setView] = useState<ViewRange>({ start: 0n, end: 100n });
  const [cursorA, setCursorA] = useState<bigint | null>(null);
  const [cursorB, setCursorB] = useState<bigint | null>(null);
  const [search, setSearch] = useState<SearchState>({
    hits: null,
    stale: false,
    running: false,
    progress: null,
    error: null,
  });

  useEffect(() => () => clientRef.current?.dispose(), []);

  const startParse = useCallback((text: string, name: string) => {
    const client = clientRef.current!;
    // supersede any previous parse/search: old tasks can never overwrite us
    parseTask.current?.cancel();
    searchTask.current?.cancel();
    setParseError(null);
    setParseProgress({ done: 0, total: 1 });
    setSearch({ hits: null, stale: false, running: false, progress: null, error: null });
    const task = client.parse(text, (done, total) => setParseProgress({ done, total }));
    parseTask.current = task;
    task.promise
      .then((next) => {
        setVcd(next);
        setFileName(name);
        setSignals([]);
        setCursorA(null);
        setCursorB(null);
        setView({ start: 0n, end: next.endTime > 0n ? next.endTime + next.endTime / 20n + 10n : 100n });
        setParseProgress(null);
      })
      .catch((e: Error & { cancelled?: boolean }) => {
        setParseProgress(null);
        if (!e.cancelled) setParseError(e.message); // old data (vcd) is kept
      });
  }, []);

  const onFile = useCallback(
    (f: File) => {
      f.text().then((text) => startParse(text, f.name));
    },
    [startParse],
  );

  const runSearch = useCallback((clockIndex: number, conditions: Condition[]) => {
    const client = clientRef.current!;
    searchTask.current?.cancel(); // old search must not overwrite the new one
    setSearch({ hits: null, stale: false, running: true, progress: { done: 0, total: 1 }, error: null });
    const task = client.search(clockIndex, conditions, (done, total) =>
      setSearch((s) => ({ ...s, progress: { done, total } })),
    );
    searchTask.current = task;
    task.promise
      .then((hits) => setSearch({ hits, stale: false, running: false, progress: null, error: null }))
      .catch((e: Error & { cancelled?: boolean }) =>
        setSearch((s) =>
          e.cancelled ? { ...s, running: false, progress: null } : { ...s, running: false, progress: null, error: e.message },
        ),
      );
  }, []);

  const jumpTo = useCallback(
    (t: bigint) => {
      if (!vcd) return;
      const span = view.end - view.start;
      const start = t - span / 2n;
      setView({ start: start < 0n ? 0n : start, end: (start < 0n ? 0n : start) + span });
      setCursorA(t);
    },
    [vcd, view],
  );

  const fit = useCallback(() => {
    if (!vcd) return;
    setView({ start: 0n, end: vcd.endTime > 0n ? vcd.endTime + vcd.endTime / 20n + 10n : 100n });
  }, [vcd]);

  const addSignal = (i: number) => setSignals((s) => [...s, { varIndex: i, format: "hex" }]);
  const removeSignal = (row: number) => setSignals((s) => s.filter((_, j) => j !== row));
  const moveSignal = (row: number, dir: -1 | 1) =>
    setSignals((s) => {
      const j = row + dir;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[row], next[j]] = [next[j], next[row]];
      return next;
    });
  const toggleFormat = (row: number) =>
    setSignals((s) => s.map((sig, j) => (j === row ? { ...sig, format: sig.format === "hex" ? "bin" : "hex" } : sig)));

  const delta = cursorA != null && cursorB != null ? (cursorB > cursorA ? cursorB - cursorA : cursorA - cursorB) : null;

  return (
    <div className="app">
      <div className="toolbar">
        <b>VCD Waveform Lab</b>
        <input
          type="file"
          accept=".vcd,.txt"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
        <button onClick={() => startParse(SAMPLE_VCD, "示例.vcd")}>加载示例</button>
        {parseProgress && (
          <>
            <span className="progress">
              <div style={{ width: `${(100 * parseProgress.done) / Math.max(1, parseProgress.total)}%` }} />
            </span>
            <button onClick={() => parseTask.current?.cancel()}>取消解析</button>
          </>
        )}
        {fileName && !parseProgress && <span className="status">{fileName}</span>}
        {parseError && <span className="error">解析失败（已保留旧数据）: {parseError}</span>}
        <span className="spacer" />
        {vcd && (
          <>
            <button onClick={fit}>全局适配</button>
            <span className="hint">滚轮缩放 · 拖拽平移 · 点击放游标A · Shift+点击放游标B</span>
          </>
        )}
      </div>
      <div className="main">
        {vcd ? (
          <>
            <HierarchyTree vcd={vcd} selected={new Set(signals.map((s) => s.varIndex))} onAdd={addSignal} />
            <div className="center">
              <div className="wavewrap">
                <div className="signallist">
                  <h3>波形信号（{signals.length}）</h3>
                  <div style={{ height: 26 }} />
                  {signals.map((sig, row) => {
                    const v = vcd.vars[sig.varIndex];
                    return (
                      <div className="sigrow" style={{ height: ROW_H }} key={row}>
                        <span className="name" title={v.fullName}>
                          {v.fullName}
                        </span>
                        <span className="meta">[{v.width}]</span>
                        {v.width > 1 && <button onClick={() => toggleFormat(row)}>{sig.format === "hex" ? "hex" : "bin"}</button>}
                        <button onClick={() => moveSignal(row, -1)}>↑</button>
                        <button onClick={() => moveSignal(row, 1)}>↓</button>
                        <button onClick={() => removeSignal(row)}>✕</button>
                      </div>
                    );
                  })}
                </div>
                <WaveCanvas
                  vcd={vcd}
                  signals={signals}
                  view={view}
                  onViewChange={setView}
                  cursorA={cursorA}
                  cursorB={cursorB}
                  onCursor={(which, t) => (which === "a" ? setCursorA(t) : setCursorB(t))}
                />
              </div>
              <div className="cursorpanel">
                <table>
                  <thead>
                    <tr>
                      <th>信号</th>
                      <th>游标 A {cursorA != null ? `(${formatTime(cursorA, vcd.timescale)})` : ""}</th>
                      <th>游标 B {cursorB != null ? `(${formatTime(cursorB, vcd.timescale)})` : ""}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signals.map((sig, row) => {
                      const v = vcd.vars[sig.varIndex];
                      const ch = vcd.changes[sig.varIndex];
                      return (
                        <tr key={row}>
                          <td>{v.fullName}</td>
                          <td>{cursorA != null ? formatBits(valueAt(ch, cursorA, v.width), sig.format) : "-"}</td>
                          <td>{cursorB != null ? formatBits(valueAt(ch, cursorB, v.width), sig.format) : "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {delta != null && <div style={{ marginTop: 4 }}>|B−A| = {formatTime(delta, vcd.timescale)}</div>}
              </div>
              <SearchPanel
                vcd={vcd}
                state={search}
                onRun={runSearch}
                onCancel={() => searchTask.current?.cancel()}
                onJump={jumpTo}
                onDirty={() => setSearch((s) => (s.hits ? { ...s, stale: true } : s))}
              />
            </div>
          </>
        ) : (
          <div style={{ padding: 24 }} className="hint">
            {parseProgress ? "正在解析…" : "请选择 VCD 文件，或点击“加载示例”。所有处理均在本地完成。"}
          </div>
        )}
      </div>
    </div>
  );
}
