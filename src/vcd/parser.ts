import type { Change, HierarchyNode, TimeScale, TimedSignal, VcdData } from './types';

export class ParseError extends Error {
  constructor(message: string, readonly line?: number, readonly column?: number) {
    super(message);
    this.name = 'ParseError';
  }
}

interface Token {
  text: string;
  line: number;
  col: number;
}

interface RawSignal {
  id: string;
  name: string;
  path: string;
  aliases: string[];
  width: number;
  type: 'wire' | 'reg';
  changes: Change[];
}

export interface ParseOptions {
  signal?: { cancelled: boolean };
  onProgress?: (loaded: number, total: number) => void;
}

const SUPPORTED_VARIABLES = new Set(['wire', 'reg']);
const TIME_UNITS = new Set(['fs', 'ps', 'ns', 'us', 'ms', 's']);
const LOGIC = new Set(['0', '1', 'x', 'z']);

function* tokenize(input: string): Generator<Token> {
  let line = 1;
  let col = 1;
  let i = 0;

  while (i < input.length) {
    const char = input[i];
    if (char === '\n') {
      i += 1;
      line += 1;
      col = 1;
      continue;
    }
    if (/\s/.test(char)) {
      i += 1;
      col += 1;
      continue;
    }

    const startCol = col;
    const start = i;
    const tokenLine = line;
    while (i < input.length && !/\s/.test(input[i])) {
      if (input[i] === '\n') {
        line += 1;
        col = 0;
      }
      i += 1;
      col += 1;
    }
    yield { text: input.slice(start, i), line: tokenLine, col: startCol };
  }
}

function fail(message: string, token?: Token): never {
  throw new ParseError(message, token?.line, token?.col);
}

function expectEnd(keyword: Token, end: Token | undefined): void {
  if (!end || end.text !== '$end') fail(`缺少 ${keyword.text} 的 $end`, end);
}

function makeNode(name: string, path: string): HierarchyNode {
  return { name, path, children: new Map(), signalId: null };
}

function normalizeVector(raw: string, width: number): string {
  const body = raw.slice(1);
  if (!body || [...body].some((bit) => !LOGIC.has(bit))) fail(`非法四态向量值 ${raw}`);
  if (body.length > width) fail(`向量值宽度 ${body.length} 超过声明宽度 ${width}`);
  return body[0].repeat(width - body.length) + body;
}

export function parseVcd(input: string, options: ParseOptions = {}): VcdData {
  const tokens = tokenize(input);
  const signals = new Map<string, RawSignal>();
  const roots = new Map<string, HierarchyNode>();
  const scopeStack: HierarchyNode[] = [];
  let timescale: TimeScale | null = null;
  let currentTime = 0n;
  let endTime = 0n;
  let inDumpVars = false;
  let definitionsEnded = false;
  let next = tokens.next();
  let tokenCount = 0;

  const currentPath = (name: string) =>
    scopeStack.length ? `${scopeStack.map((node) => node.name).join('.')}.${name}` : name;

  const addToTree = (name: string, id: string, token: Token) => {
    const path = currentPath(name);
    const children = scopeStack.length ? scopeStack[scopeStack.length - 1].children : roots;
    if (children.has(name) && children.get(name)!.signalId !== id) fail(`作用域内名称重复: ${path}`, token);
    if (!children.has(name)) {
      const node = makeNode(name, path);
      node.signalId = id;
      children.set(name, node);
    }
  };

  const readIgnoredHeader = (keyword: Token) => {
    let token = tokens.next().value as Token | undefined;
    while (token && token.text !== '$end') token = tokens.next().value;
    expectEnd(keyword, token);
  };

  const applyChange = (rawValue: string, idToken: Token | undefined, scalar: boolean) => {
    if (!idToken) fail('变化缺少标识码');
    const signal = signals.get(idToken.text);
    if (!signal) fail(`未知标识码: ${idToken.text}`, idToken);

    let value: string;
    if (scalar) {
      if (signal.width !== 1) fail(`标量值不能赋给 ${signal.width} 位信号 ${signal.path}`, idToken);
      if (!LOGIC.has(rawValue)) fail(`非法标量值: ${rawValue}`, idToken);
      value = rawValue;
    } else {
      if (!rawValue.startsWith('b')) fail(`非法向量值: ${rawValue}`, idToken);
      value = normalizeVector(rawValue, signal.width);
    }

    const changes = signal.changes;
    const last = changes[changes.length - 1];
    if (last && last.t === currentTime) last.v = value;
    else changes.push({ t: currentTime, v: value });
  };

  const applyScalarToken = (token: Token) => {
    const value = token.text[0];
    const id = token.text.slice(1);
    if (!id) {
      applyChange(value, tokens.next().value as Token | undefined, true);
    } else {
      applyChange(value, { text: id, line: token.line, col: token.col + 1 }, true);
    }
  };

  while (!next.done) {
    const token = next.value;
    tokenCount += 1;
    if ((tokenCount & 255) === 0) {
      if (options.signal?.cancelled) throw new ParseError('已取消');
      options.onProgress?.(token.line, input.split('\n').length);
    }

    if (!definitionsEnded) {
      if (token.text === '$timescale') {
        const numberToken = tokens.next().value as Token | undefined;
        const unitToken = tokens.next().value as Token | undefined;
        const end = tokens.next().value as Token | undefined;
        const number = Number(numberToken?.text);
        if (!numberToken || !Number.isFinite(number) || number <= 0) fail('非法 timescale 数值', numberToken);
        if (!unitToken || !TIME_UNITS.has(unitToken.text)) fail('不支持的 timescale 单位', unitToken);
        expectEnd(token, end);
        timescale = { number, unit: unitToken.text };
      } else if (token.text === '$scope') {
        const kind = tokens.next().value as Token | undefined;
        const name = tokens.next().value as Token | undefined;
        const end = tokens.next().value as Token | undefined;
        if (!kind || !name?.text) fail('非法 $scope', kind ?? name ?? token);
        expectEnd(token, end);
        const path = currentPath(name.text);
        const children = scopeStack.length ? scopeStack[scopeStack.length - 1].children : roots;
        if (!children.has(name.text)) children.set(name.text, makeNode(name.text, path));
        scopeStack.push(children.get(name.text)!);
      } else if (token.text === '$upscope') {
        const end = tokens.next().value as Token | undefined;
        expectEnd(token, end);
        if (!scopeStack.length) fail('多余的 $upscope', token);
        scopeStack.pop();
      } else if (token.text === '$var') {
        const typeToken = tokens.next().value as Token | undefined;
        const widthToken = tokens.next().value as Token | undefined;
        const idToken = tokens.next().value as Token | undefined;
        let nameToken = tokens.next().value as Token | undefined;
        let end = tokens.next().value as Token | undefined;
        if (nameToken && nameToken.text.startsWith('[') && nameToken.text.endsWith(']')) {
          nameToken = end;
          end = tokens.next().value as Token | undefined;
        }
        while (end && end.text !== '$end') end = tokens.next().value as Token | undefined;
        if (!typeToken || !SUPPORTED_VARIABLES.has(typeToken.text)) fail(`不支持的变量类型: ${typeToken?.text ?? '(缺失)'}`, typeToken);
        const width = Number(widthToken?.text);
        if (!widthToken || !Number.isInteger(width) || width <= 0) fail('非法信号位宽', widthToken);
        if (!idToken?.text || !nameToken?.text) fail('非法 $var 声明', token);
        expectEnd(token, end);

        const path = currentPath(nameToken.text);
        const existing = signals.get(idToken.text);
        if (existing) {
          if (existing.width !== width || existing.type !== typeToken.text) fail(`别名 ${path} 的位宽或类型不一致`, token);
          existing.aliases.push(path);
        } else {
          signals.set(idToken.text, {
            id: idToken.text,
            name: nameToken.text,
            path,
            aliases: [path],
            width,
            type: typeToken.text as 'wire' | 'reg',
            changes: [],
          });
        }
        addToTree(nameToken.text, idToken.text, token);
      } else if (token.text === '$enddefinitions') {
        const end = tokens.next().value as Token | undefined;
        expectEnd(token, end);
        while (scopeStack.length) scopeStack.pop();
        definitionsEnded = true;
      } else if (token.text.startsWith('$')) {
        readIgnoredHeader(token);
      } else {
        fail('定义区出现未知内容', token);
      }
    } else {
      if (token.text.startsWith('#')) {
        const rawTime = token.text.slice(1);
        if (!/^\d+$/.test(rawTime)) fail('非法时间戳', token);
        const nextTime = BigInt(rawTime);
        if (nextTime < currentTime) fail(`时间倒退: #${rawTime} 小于 #${currentTime}`, token);
        currentTime = nextTime;
        endTime = currentTime > endTime ? currentTime : endTime;
      } else if (token.text === '$end') {
        inDumpVars = false;
      } else if (token.text === '$dumpvars') {
        inDumpVars = true;
      } else if (token.text.startsWith('$dump')) {
        fail(`仅支持 $dumpvars，不支持 ${token.text}`, token);
      } else if (token.text[0] === '0' || token.text[0] === '1' || token.text[0] === 'x' || token.text[0] === 'z') {
        applyScalarToken(token);
      } else if (token.text.startsWith('b')) {
        applyChange(token.text, tokens.next().value, false);
      } else {
        fail('转储区出现未知内容', token);
      }
    }

    next = tokens.next();
  }

  if (!definitionsEnded) throw new ParseError('缺少 $enddefinitions $end');
  if (inDumpVars) throw new ParseError('$dumpvars 缺少 $end');
  if (!signals.size) throw new ParseError('未声明任何 wire/reg 信号');

  const result = new Map<string, TimedSignal>();
  for (const signal of signals.values()) result.set(signal.id, { ...signal });
  return { timescale, signals: result, roots, endTime };
}
