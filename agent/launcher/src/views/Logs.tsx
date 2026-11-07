import { save } from '@tauri-apps/plugin-dialog';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, errorText } from '../api';
import { Icon } from '../components/Icon';
import { Alert, Toggle } from '../components/controls';
import { useLogs } from '../hooks';
import { parseLogLine, todayStamp } from '../lib';

const NEAR_BOTTOM_PX = 24;

export function LogsView() {
  const lines = useLogs();
  const parsed = useMemo(() => lines.map(parseLogLine), [lines]);
  const [follow, setFollow] = useState(true);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (follow && element) element.scrollTop = element.scrollHeight;
  }, [parsed, follow]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const onScroll = () => {
    const element = scroller.current;
    if (!element) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < NEAR_BOTTOM_PX;
    if (atBottom !== follow) setFollow(atBottom);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setNotice({ tone: 'success', text: 'Copied to the clipboard.' });
    } catch (err) {
      setNotice({ tone: 'error', text: errorText(err) });
    }
  };

  const saveToFile = async () => {
    try {
      const path = await save({
        title: 'Save logs',
        defaultPath: `filereadwrite-${todayStamp()}.log`,
        filters: [{ name: 'Log file', extensions: ['log', 'txt'] }],
      });
      if (!path) return;
      await api.saveLogs(path);
      setNotice({ tone: 'success', text: 'Logs saved.' });
    } catch (err) {
      setNotice({ tone: 'error', text: errorText(err) });
    }
  };

  return (
    <>
      <div className="log-toolbar">
        <div className="log-toolbar-left">
          <Toggle label="Follow" checked={follow} onChange={setFollow} />
          <span className="log-count">{lines.length === 1 ? '1 line' : `${lines.length} lines`}</span>
        </div>
        <div className="log-toolbar-right">
          <button type="button" className="btn btn-ghost btn-xs" disabled={lines.length === 0} onClick={copy}>
            <Icon name="copy" size={12} />
            Copy
          </button>
          <button type="button" className="btn btn-ghost btn-xs" disabled={lines.length === 0} onClick={saveToFile}>
            <Icon name="download" size={12} />
            Save…
          </button>
        </div>
      </div>
      {notice && (
        <div style={{ padding: '8px 16px 0' }}>
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      )}
      <div className="log-content" ref={scroller} onScroll={onScroll} role="log" aria-live="off">
        {parsed.length === 0 ? (
          <div className="log-empty">Nothing yet. Activity shows up here once FileReadWrite starts.</div>
        ) : (
          parsed.map((line, index) => (
            <div key={index} className={`log-line ${line.level}`}>
              {line.time && <span className="log-ts">{line.time}</span>}
              {line.level && <span className={`log-level log-${line.level}`}>{line.level}</span>}
              <span className="log-msg">{line.message}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
