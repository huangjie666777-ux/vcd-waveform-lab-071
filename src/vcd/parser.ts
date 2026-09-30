import { Change, VcdError, VcdFile, VcdVar, CancelledError, Timescale } from "./types";

export interface ParseOptions {
  onProgress?: (done: number, total: number) => void;
  shouldCancel?: () => boolean;
  /** yield to the event loop every N tokens so the worker can receive cancel */
  yieldEvery?: number;
}

interface Tok {
  tok: string;
  line: number;
}

const SUPPORTED_TYPES = new Set(["wire", "reg"]);
const SKIP_COMMANDS = new Set(["$date", "$version", "$comment", "$enddefinitions"]);

function isValueChar(c: string): boolean {
  return c === "0" || c === "1" || c === "x" || c === "X" || c === "z" || c === "Z";
}

/** Left-extend a short vector per VCD rules: pad with 0, or with x/z when the MSB is x/z. */
export function padValue(value: string, width: number): string {
  const v = value.toLowerCase();
  if (v.length >= width) return v;
  const msb = v[0];
  const pad = msb === "x" || msb === "z" ? msb : "0";
  return pad.repeat(width - v.length) + v;
}

function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  const lines = text.split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    const parts = lines[li].split(/\s+/);
    for (const p of parts) {
      if (p.length > 0) out.push({ tok: p, line: li + 1 });
    }
  }
  return out;
}

export async function parseVcd(text: string, opts: ParseOptions = {}): Promise<VcdFile> {
  const tokens = tokenize(text);
  const total = tokens.length;
  const yieldEvery = opts.yieldEvery ?? 100000;

  const vars: VcdVar[] = [];
  const codeMap = new Map<string, number[]>();
  const changes: Change[][] = [];
  const scopeStack: string[] = [];
  let timescale: Timescale | null = null;
  let lastT = 0n;
  let sawEnddefinitions = false;

  const applyChange = (code: string, rawValue: string, line: number) => {
    const indices = codeMap.get(code);
    if (!indices) throw new VcdError(line, `未知标识码 "${code}"`);
    for (const idx of indices) {
      const width = vars[idx].width;
      if (rawValue.length > width) {
        throw new VcdError(
          line,
          `值 "${rawValue}" 宽度 ${rawValue.length} 超过变量 ${vars[idx].fullName} 的位宽 ${width}`,
        );
      }
      const v = padValue(rawValue, width);
      const arr = changes[idx];
      const last = arr[arr.length - 1];
      if (last && last.t === lastT) last.v = v; // same timestamp: last wins
      else arr.push({ t: lastT, v });
    }
  };

  const readUntilEnd = (i: number): { parts: string[]; line: number; next: number } => {
    const parts: string[] = [];
    const line = tokens[i].line;
    i++;
    while (i < tokens.length && tokens[i].tok !== "$end") {
      parts.push(tokens[i].tok);
      i++;
    }
    if (i >= tokens.length) throw new VcdError(line, "命令缺少 $end");
    return { parts, line, next: i };
  };

  function handleChangeToken(i: number): number {
    const { tok, line } = tokens[i];
    if (isValueChar(tok[0]) && tok.length >= 2) {
      applyChange(tok.slice(1), tok[0], line);
      return i + 1;
    }
    if (/^[bB][01xXzZ]+$/.test(tok)) {
      const codeTok = tokens[i + 1];
      if (!codeTok) throw new VcdError(line, "向量值缺少标识码");
      applyChange(codeTok.tok, tok.slice(1), line);
      return i + 2;
    }
    throw new VcdError(line, `无法识别的内容 "${tok}"`);
  }

  let i = 0;
  while (i < tokens.length) {
    if (i % yieldEvery === 0) {
      if (opts.shouldCancel?.()) throw new CancelledError();
      opts.onProgress?.(i, total);
      // allow the worker event loop to process cancel messages
      await new Promise((r) => setTimeout(r, 0));
    }
    const { tok, line } = tokens[i];

    if (tok === "$scope") {
      const { parts, next } = readUntilEnd(i);
      scopeStack.push(parts[1] ?? parts[0] ?? "?");
      i = next;
    } else if (tok === "$upscope") {
      scopeStack.pop();
      i = readUntilEnd(i).next;
    } else if (tok === "$var") {
      const { parts, next } = readUntilEnd(i);
      if (parts.length < 4) throw new VcdError(line, "$var 参数不完整");
      const [vtype, sizeStr, code, name, range] = parts;
      if (!SUPPORTED_TYPES.has(vtype)) {
        throw new VcdError(line, `不支持的变量类型 "${vtype}"（仅支持 wire/reg）`);
      }
      const size = Number(sizeStr);
      if (!Number.isInteger(size) || size < 1) throw new VcdError(line, `非法位宽 "${sizeStr}"`);
      let width = size;
      if (range) {
        const m = /^\[(\d+):(\d+)\]$/.exec(range);
        if (!m) throw new VcdError(line, `无法解析位宽范围 "${range}"`);
        width = Math.abs(Number(m[1]) - Number(m[2])) + 1;
        if (width !== size) throw new VcdError(line, `位宽 ${size} 与范围 ${range} 不一致`);
      }
      const index = vars.length;
      const fullName = [...scopeStack, name].join(".");
      vars.push({ index, code, name, width, vtype: vtype as VcdVar["vtype"], scope: [...scopeStack], fullName });
      changes.push([]);
      const list = codeMap.get(code);
      if (list) list.push(index);
      else codeMap.set(code, [index]);
      i = next;
    } else if (tok === "$timescale") {
      const { parts, next } = readUntilEnd(i);
      const joined = parts.join(" ");
      const m = /^(1|10|100)\s*(s|ms|us|ns|ps|fs)$/i.exec(joined);
      if (!m) throw new VcdError(line, `无法解析 timescale "${joined}"`);
      timescale = { value: Number(m[1]), unit: m[2].toLowerCase() };
      i = next;
    } else if (SKIP_COMMANDS.has(tok)) {
      i = readUntilEnd(i).next;
      if (tok === "$enddefinitions") sawEnddefinitions = true;
    } else if (tok === "$dumpvars" || tok === "$dumpon" || tok === "$dumpoff") {
      i++;
      while (i < tokens.length && tokens[i].tok !== "$end") {
        i = handleChangeToken(i);
      }
    } else if (tok.startsWith("#")) {
      const tStr = tok.slice(1);
      if (!/^\d+$/.test(tStr)) throw new VcdError(line, `非法时间戳 "${tok}"`);
      const t = BigInt(tStr);
      if (t < lastT) throw new VcdError(line, `时间倒退: ${t} < ${lastT}`);
      lastT = t;
    } else if (tok === "$end") {
      i++;
    } else if (tok[0] === "$") {
      throw new VcdError(line, `不支持的命令 "${tok}"`);
    } else {
      i = handleChangeToken(i);
      continue;
    }
    i++;
  }

  if (!sawEnddefinitions && vars.length === 0) {
    throw new VcdError(1, "文件中没有找到变量定义");
  }
  opts.onProgress?.(total, total);
  return { timescale, vars, changes, endTime: lastT };
}
