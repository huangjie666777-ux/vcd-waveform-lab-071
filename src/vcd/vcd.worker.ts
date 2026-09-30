/// <reference lib="webworker" />
import { ParseError, parseVcd } from './parser';
import { findMatches, searchSignals } from './search';
import type { WorkerRequest, WorkerResponse } from './types';

let activeTask = 0;
let cancelled = false;
let currentData: import('./types').VcdData | null = null;
let queue: { request: Exclude<WorkerRequest, { type: 'cancel' }>; resolve: () => void }[] = [];
let running = false;

function post(message: WorkerResponse) {
  (self as unknown as Worker).postMessage(message);
}

const handleMessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === 'cancel') {
    if (request.taskId === activeTask) cancelled = true;
    return;
  }
  queue.push({ request, resolve: () => {} });
  drain();
};

async function drain() {
  if (running) return;
  running = true;
  while (queue.length) {
    const item = queue.shift()!;
    const request = item.request;
    if (request.taskId < activeTask) continue;
    activeTask = request.taskId;
    cancelled = false;
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (request.taskId < activeTask) continue;
    const token = { get cancelled() { return cancelled || activeTask !== request.taskId; } };
    try {
      if (request.type === 'parse') {
        const lines = Math.max(1, request.text.split('\n').length);
        const data = parseVcd(request.text, {
          signal: token,
          onProgress: (loaded) => post({ type: 'progress', taskId: request.taskId, progress: { phase: 'parse', loaded, total: lines } }),
        });
        if (cancelled) post({ type: 'cancelled', taskId: request.taskId });
        else if (request.taskId === activeTask) {
          currentData = data;
          post({ type: 'parse-done', taskId: request.taskId, data });
        }
      } else if (request.type === 'signal-search') {
        if (!currentData) throw new Error('请先导入 VCD 文件');
        const signals = searchSignals(currentData, request.query);
        if (request.taskId === activeTask) post({ type: 'signal-search-done', taskId: request.taskId, signals });
      } else {
        if (!currentData) throw new Error('请先导入 VCD 文件');
        const hits = findMatches(currentData, request.clockId, request.conditions, {
          signal: token,
          onProgress: (scanned, total) => post({ type: 'progress', taskId: request.taskId, progress: { phase: 'search', scanned, total } }),
        });
        if (cancelled) post({ type: 'cancelled', taskId: request.taskId });
        else if (request.taskId === activeTask) post({ type: 'search-done', taskId: request.taskId, hits });
      }
    } catch (error) {
      if (request.taskId !== activeTask) continue;
      const message = error instanceof Error ? error.message : String(error);
      if (request.type === 'parse' && error instanceof ParseError) {
        post({ type: 'parse-error', taskId: request.taskId, message, line: error.line, column: error.column });
      } else if (request.type === 'parse') {
        post({ type: 'parse-error', taskId: request.taskId, message });
      } else {
        post({ type: 'search-error', taskId: request.taskId, message });
      }
    }
  }
  running = false;
}
self.onmessage = handleMessage;
