import type { SearchHit, Signal, VcdData } from './types';
import { valueAt } from './waveform';

export interface SearchCondition {
  signalId: string;
  pattern: string;
}

export interface SearchOptions {
  signal?: { cancelled: boolean };
  onProgress?: (scanned: number, total: number) => void;
}

function normalizePattern(pattern: string, width: number): string {
  if (!/^[01xz]+$/i.test(pattern)) throw new Error('条件只能包含 0、1、x、z');
  const normalized = pattern.toLowerCase();
  if ([...normalized].length !== width) throw new Error(`条件必须正好 ${width} 位`);
  return normalized;
}

export function findMatches(data: VcdData, clockId: string, requested: SearchCondition[], options: SearchOptions = {}): SearchHit[] {
  const clock = data.signals.get(clockId);
  if (!clock) throw new Error('请选择一位时钟信号');
  if (clock.width !== 1) throw new Error('时钟必须是一位信号');

  const conditions = requested.map((condition) => {
    const signal = data.signals.get(condition.signalId);
    if (!signal) throw new Error('条件信号不存在');
    return { signal, pattern: normalizePattern(condition.pattern, signal.width) };
  });

  const hits: SearchHit[] = [];
  for (let i = 0; i < clock.changes.length; i += 1) {
    if ((i & 1023) === 0) {
      if (options.signal?.cancelled) throw new Error('已取消');
      options.onProgress?.(i, clock.changes.length);
    }

    const change = clock.changes[i];
    if (change.v !== '1') continue;
    const previous = i > 0 ? clock.changes[i - 1].v : 'x';
    if (previous !== '0') continue;

    let matched = true;
    for (const condition of conditions) {
      if (valueAt(condition.signal, change.t) !== condition.pattern) {
        matched = false;
        break;
      }
    }
    if (matched) hits.push({ t: change.t });
  }
  options.onProgress?.(clock.changes.length, clock.changes.length);
  return hits;
}

export function searchSignals(data: VcdData, query: string): Signal[] {
  const normalized = query.trim().toLowerCase();
  return [...data.signals.values()]
    .filter((signal) => !normalized || signal.path.toLowerCase().includes(normalized) || signal.aliases.some((alias) => alias.toLowerCase().includes(normalized)))
    .map(({ id, name, path, aliases, width, type }) => ({ id, name, path, aliases, width, type }));
}
