import { useEffect, useMemo, useState } from 'react';
import type { HierarchyNode, TimedSignal } from '../vcd/types';

interface Props {
  roots: Map<string, HierarchyNode>;
  signals: Map<string, TimedSignal>;
  selectedIds: string[];
  onAdd: (id: string) => void;
  search: (query: string) => Promise<unknown>;
}

export function SignalBrowser({ roots, signals, selectedIds, onAdd, search }: Props) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const queryLower = query.trim().toLowerCase();

  const [matches, setMatches] = useState<import('../vcd/types').Signal[] | null>(null);
  const allSignals = useMemo(() => [...signals.values()], [signals]);

  useEffect(() => {
    let active = true;
    if (!queryLower) { setMatches(null); return; }
    search(query).then((result) => { if (active) setMatches(result as import('../vcd/types').Signal[]); });
    return () => { active = false; };
  }, [query, queryLower, search]);

  const localMatches = useMemo(() => {
    if (!queryLower) return null;
    return matches ?? allSignals.filter((signal) => signal.path.toLowerCase().includes(queryLower) || signal.aliases.some((alias) => alias.toLowerCase().includes(queryLower)));
  }, [queryLower, matches, allSignals]);

  const toggle = (path: string) => setCollapsed((old) => {
    const next = new Set(old);
    if (next.has(path)) next.delete(path); else next.add(path);
    return next;
  });

  const renderNode = (node: HierarchyNode, depth: number): React.ReactNode => {
    const hasChildren = node.children.size > 0;
    const expanded = !collapsed.has(node.path);
    const signal = node.signalId ? signals.get(node.signalId) : null;
    const directMatch = !queryLower || node.path.toLowerCase().includes(queryLower);
    const children = [...node.children.values()].map((child) => renderNode(child, depth + 1)).filter(Boolean);
    if (queryLower && !directMatch && children.length === 0) return null;
    return <div key={node.path} className="tree-row-wrap">
      <div className="tree-row" style={{ paddingLeft: depth * 14 + 6 }}>
        {hasChildren ? <button onClick={() => toggle(node.path)}>{expanded ? '▾' : '▸'}</button> : <span className="leaf-dot" />}
        <span className={signal ? 'signal-name' : 'scope-name'}>{node.name}</span>
        {signal && <><span className="signal-meta">{signal.type}[{signal.width}]</span>
          <button disabled={selectedIds.includes(signal.id)} onClick={() => onAdd(signal.id)}>添加</button></>}
      </div>
      {expanded && children}
    </div>;
  };

  return <section className="panel browser">
    <h2>层级与信号</h2>
    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索层级路径或别名" />
      {localMatches && queryLower ? <div className="search-results">
      {localMatches.length ? localMatches.map((signal) => <div key={signal.id} className="search-row">
        <span>{signal.path}</span>
        <small>{signal.aliases.length > 1 ? ` ${signal.aliases.length} 个别名` : ''}</small>
        <button disabled={selectedIds.includes(signal.id)} onClick={() => onAdd(signal.id)}>添加</button>
      </div>) : <p className="muted">无匹配信号</p>}
    </div> : <div className="tree">{[...roots.values()].map((node) => renderNode(node, 0))}</div>}
  </section>;
}
