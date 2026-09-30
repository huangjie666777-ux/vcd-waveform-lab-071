import { useMemo, useState } from "react";
import { VcdFile, VcdVar } from "../vcd/types";

interface ScopeNode {
  name: string;
  children: Map<string, ScopeNode>;
  vars: VcdVar[];
}

function buildTree(vars: VcdVar[]): ScopeNode {
  const root: ScopeNode = { name: "", children: new Map(), vars: [] };
  for (const v of vars) {
    let node = root;
    for (const s of v.scope) {
      let child = node.children.get(s);
      if (!child) {
        child = { name: s, children: new Map(), vars: [] };
        node.children.set(s, child);
      }
      node = child;
    }
    node.vars.push(v);
  }
  return root;
}

export function HierarchyTree(props: {
  vcd: VcdFile;
  selected: Set<number>;
  onAdd: (index: number) => void;
}) {
  const [filter, setFilter] = useState("");
  const tree = useMemo(() => buildTree(props.vcd.vars), [props.vcd]);
  const q = filter.trim().toLowerCase();

  const renderNode = (node: ScopeNode, path: string): React.ReactNode => {
    const vars = q ? node.vars.filter((v) => v.fullName.toLowerCase().includes(q)) : node.vars;
    const children = [...node.children.values()]
      .map((c) => renderNode(c, path + c.name + "."))
      .filter(Boolean);
    if (q && vars.length === 0 && children.length === 0) return null;
    return (
      <div key={path || "(root)"}>
        {node.name && <div className="scopename">▸ {node.name}</div>}
        <div className="scope">
          {vars.map((v) => (
            <div className="var" key={v.index}>
              <button
                disabled={props.selected.has(v.index)}
                onClick={() => props.onAdd(v.index)}
                title="添加到波形区"
              >
                +
              </button>
              <span>{v.name}</span>
              <span className="meta">
                {v.vtype}[{v.width}]
              </span>
            </div>
          ))}
          {children}
        </div>
      </div>
    );
  };

  return (
    <div className="sidebar">
      <h3>层级 / 信号</h3>
      <div style={{ padding: "0 8px 6px" }}>
        <input
          style={{ width: "100%" }}
          placeholder="搜索信号名…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="tree">{renderNode(tree, "")}</div>
    </div>
  );
}
