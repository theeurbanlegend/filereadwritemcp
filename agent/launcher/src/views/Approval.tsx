import { LogicalSize, getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, type PendingApproval } from '../api';
import { Icon } from '../components/Icon';
import { useNow, useSnapshot } from '../hooks';
import { clock, programName } from '../lib';

const WIDTH = 460;
const INTERLOCK_MS = 1000;
const RESOLVED_MS = 600;
const VANISHED_MS = 1600;
const URGENT_SECONDS = 10;
const LONG_ARG = 48;

type Resolution = { tone: 'approved' | 'denied'; text: string };

function deadline(item: PendingApproval): number {
  return item.receivedAtMs + item.timeoutSec * 1000;
}

export function ApprovalWindow() {
  const snapshot = useSnapshot();
  const now = useNow(200);
  const [current, setCurrent] = useState<PendingApproval | null>(null);
  const [shownAt, setShownAt] = useState(0);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const busy = useRef(false);
  const body = useRef<HTMLDivElement>(null);
  const denyButton = useRef<HTMLButtonElement>(null);

  const approvals = snapshot?.approvals ?? [];

  const finish = useCallback((result: Resolution, holdMs: number) => {
    busy.current = true;
    setResolution(result);
    window.setTimeout(() => {
      busy.current = false;
      setResolution(null);
      setCurrent(null);
    }, holdMs);
  }, []);

  useEffect(() => {
    if (!snapshot || busy.current) return;
    if (current) {
      if (!snapshot.approvals.some((a) => a.id === current.id)) {
        const expired = Date.now() >= deadline(current);
        finish(
          {
            tone: 'denied',
            text: expired ? 'Timed out, so nothing ran.' : 'FileReadWrite stopped, so nothing ran.',
          },
          VANISHED_MS,
        );
      }
      return;
    }
    const next = snapshot.approvals[0];
    if (next) {
      setCurrent(next);
      setShownAt(Date.now());
    } else if (!resolution) {
      getCurrentWindow().close();
    }
  }, [snapshot, current, resolution, finish]);

  useEffect(() => {
    if (current) denyButton.current?.focus();
  }, [current]);

  useLayoutEffect(() => {
    const element = body.current;
    if (!element) return;
    const fit = () => {
      const height = Math.ceil(element.getBoundingClientRect().height);
      if (height > 0) getCurrentWindow().setSize(new LogicalSize(WIDTH, height)).catch(() => undefined);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    fit();
    return () => observer.disconnect();
  }, [current]);

  const decide = useCallback(
    async (approved: boolean) => {
      if (!current || busy.current) return;
      if (approved && Date.now() - shownAt < INTERLOCK_MS) return;
      busy.current = true;
      let sent = false;
      try {
        sent = await api.decide(current.id, approved);
      } catch {
        sent = false;
      }
      busy.current = false;
      if (!sent) {
        finish({ tone: 'denied', text: 'Timed out, so nothing ran.' }, VANISHED_MS);
      } else if (approved) {
        finish({ tone: 'approved', text: 'Approved. Running…' }, RESOLVED_MS);
      } else {
        finish({ tone: 'denied', text: 'Denied. Nothing ran.' }, RESOLVED_MS);
      }
    },
    [current, shownAt, finish],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter') {
        event.preventDefault();
        decide(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [decide]);

  if (!current) {
    return <div className="approval-window" ref={body} />;
  }

  const total = current.timeoutSec * 1000;
  const remainingMs = Math.max(0, deadline(current) - now);
  const remaining = remainingMs / 1000;
  const urgent = remaining <= URGENT_SECONDS;
  const locked = now - shownAt < INTERLOCK_MS;
  const name = programName(current.exe);
  const position = Math.max(1, approvals.findIndex((a) => a.id === current.id) + 1);
  const count = Math.max(approvals.length, position);

  return (
    <div className="approval-window" ref={body}>
      <div className="modal-body">
        <div className="modal-heading-row">
          <div className="modal-title-wrap">
            <Icon name="shieldCheck" size={20} />
            <h1 className="modal-h2">An AI app wants to run a command</h1>
          </div>
          {count > 1 && (
            <span className="queue-pill">
              {position} of {count}
            </span>
          )}
        </div>

        <div className={`program-card${resolution ? ' resolved' : ''}`}>
          <div className="program-header-row">
            <span className="section-eyebrow">Program</span>
          </div>
          <div className="program-executable" title={current.exe}>
            {name}
          </div>
          {current.risky && (
            <div className="alert alert-risk">
              <Icon name="alert" />
              <div>
                <strong>{name} can run any code</strong>
                Approving lets this command read or change any file on this computer.
              </div>
            </div>
          )}
          <div className="args-container">
            <span className="section-eyebrow">Arguments</span>
            {current.args.length === 0 ? (
              <span className="no-args">No arguments.</span>
            ) : (
              <div className="arg-chips-wrap">
                {current.args.map((arg, index) => (
                  <span key={index} className={`arg-chip${arg.length > LONG_ARG ? ' long' : ''}`}>
                    {arg === '' ? '""' : arg}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="context-block">
          <div className="context-row">
            <Icon name="folder" size={14} />
            <span>
              Runs in <span className="context-path">{current.cwd}</span>
            </span>
          </div>
          {snapshot?.profile && (
            <div className="profile-line">
              Machine profile: <strong>{snapshot.profile}</strong>
            </div>
          )}
        </div>

        {resolution ? (
          <div className={`resolution-banner ${resolution.tone}`} role="status">
            <Icon name={resolution.tone === 'approved' ? 'check' : 'block'} />
            {resolution.text}
          </div>
        ) : (
          <>
            <div className="countdown-section">
              <div className={`countdown-text-row${urgent ? ' danger' : ''}`}>
                <span>Automatic safety timeout</span>
                <span aria-live={urgent ? 'polite' : 'off'}>Auto-deny in {clock(remaining)}</span>
              </div>
              <div className="countdown-track">
                <div
                  className={`countdown-fill${urgent ? ' danger' : ''}`}
                  style={{ width: `${total > 0 ? (remainingMs / total) * 100 : 0}%` }}
                />
              </div>
            </div>

            {locked && (
              <div className="interlock-banner">
                <Icon name="lock" size={13} />
                Accidental keypress lock active · 1s safety pause
              </div>
            )}

            <div className="actions-footer">
              <button
                ref={denyButton}
                type="button"
                className={`btn btn-deny focused${urgent ? ' urgent' : ''}`}
                onClick={() => decide(false)}
              >
                <Icon name="x" size={15} />
                Deny
                <span className="key-hint">[Esc]</span>
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={locked}
                onClick={() => decide(true)}
              >
                <Icon name="check" size={15} />
                Approve
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
