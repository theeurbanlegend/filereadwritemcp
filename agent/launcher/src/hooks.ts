import { useEffect, useState } from 'react';
import { api, onLog, onSnapshot, type Snapshot } from './api';

export function useSnapshot(): Snapshot | null {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  useEffect(() => {
    let alive = true;
    const unlisten = onSnapshot((next) => alive && setSnapshot(next));
    api.snapshot().then((first) => alive && setSnapshot((current) => current ?? first));
    return () => {
      alive = false;
      unlisten.then((stop) => stop());
    };
  }, []);
  return snapshot;
}

export function useLogs(limit = 5000): string[] {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    const pending: string[] = [];
    let loaded = false;
    const unlisten = onLog((line) => {
      if (!alive) return;
      if (!loaded) {
        pending.push(line);
        return;
      }
      setLines((current) => [...current, line].slice(-limit));
    });
    api.logs().then((initial) => {
      if (!alive) return;
      loaded = true;
      setLines([...initial, ...pending].slice(-limit));
    });
    return () => {
      alive = false;
      unlisten.then((stop) => stop());
    };
  }, [limit]);
  return lines;
}

export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
