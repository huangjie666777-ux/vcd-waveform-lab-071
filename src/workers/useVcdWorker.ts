import { useCallback, useEffect, useRef, useState } from 'react';
import type { ParseRequest, SearchRequest, SignalSearchRequest, VcdData, WorkerProgress, WorkerResponse } from '../vcd/types';

const WorkerConstructor = new Worker(new URL('../vcd/vcd.worker.ts', import.meta.url), { type: 'module' });

export function useVcdWorker() {
  const worker = useRef(WorkerConstructor);
  const taskId = useRef(0);
  const [data, setData] = useState<VcdData | null>(null);
  const [progress, setProgress] = useState<WorkerProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.taskId !== taskId.current) return;
      if (message.type === 'progress') {
        setProgress(message.progress);
        return;
      }
      setBusy(false);
      setProgress(null);
      if (message.type === 'parse-done') {
        setData(message.data);
        setError(null);
      } else if (message.type === 'cancelled') {
        setError(null);
      } else if (message.type === 'parse-error' || message.type === 'search-error') {
        setError(message.type === 'parse-error' && message.line ? `${message.message}（第 ${message.line} 行${message.column ? `，第 ${message.column} 列` : ''}）` : message.message);
      }
    };
    const current = worker.current;
    current.addEventListener('message', onMessage);
    return () => current.removeEventListener('message', onMessage);
  }, []);

  const start = useCallback(<T extends { taskId: number }>(make: (id: number) => T) => {
    taskId.current += 1;
    const id = taskId.current;
    setBusy(true);
    setError(null);
    worker.current.postMessage(make(id));
    return id;
  }, []);

  const cancel = useCallback(() => {
    worker.current.postMessage({ type: 'cancel', taskId: taskId.current });
    setBusy(false);
  }, []);

  const parseText = useCallback((fileName: string, text: string) => {
    start((id): ParseRequest => ({ type: 'parse', taskId: id, fileName, text }));
  }, [start]);

  const searchSignals = useCallback((query: string) => {
    const id = start((idTask): SignalSearchRequest => ({ type: 'signal-search', taskId: idTask, query }));
    return new Promise((resolve) => {
      const listener = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.taskId !== id) return;
        if (event.data.type === 'signal-search-done') {
          worker.current.removeEventListener('message', listener);
          resolve(event.data.signals);
        }
      };
      worker.current.addEventListener('message', listener);
    });
  }, [start]);

  const searchMatches = useCallback((clockId: string, conditions: SearchRequest['conditions']) => new Promise<import('../vcd/types').SearchHit[]>((resolve, reject) => {
    const localId = start((task): SearchRequest => ({ type: 'search', taskId: task, clockId, conditions }));
    const listener = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.taskId !== localId) return;
      if (event.data.type === 'search-done') {
        worker.current.removeEventListener('message', listener);
        resolve(event.data.hits);
      } else if (event.data.type === 'search-error') {
        worker.current.removeEventListener('message', listener);
        reject(new Error(event.data.message));
      }
    };
    worker.current.addEventListener('message', listener);
  }), [start]);

  return { data, progress, busy, error, setError, parseText, searchSignals, searchMatches, cancel };
}
