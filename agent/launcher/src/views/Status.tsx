import { useEffect, useState } from 'react';
import { api, errorText, type ProfileDetails, type Snapshot, type Status } from '../api';
import { Icon } from '../components/Icon';
import { Alert, Spinner } from '../components/controls';
import { hostOf, programName } from '../lib';
import type { Tab } from './MainWindow';

type Tone = 'connected' | 'working' | 'idle' | 'error';

interface Presentation {
  tone: Tone;
  word: string;
  explainer: string;
}

function present(status: Status, host: string): Presentation {
  switch (status.kind) {
    case 'connected':
      return { tone: 'connected', word: 'Connected', explainer: 'AI apps can reach the folders below.' };
    case 'connecting':
      return { tone: 'working', word: 'Connecting…', explainer: host ? `Reaching ${host}.` : 'Reaching the server.' };
    case 'reconnecting':
      return {
        tone: 'working',
        word: 'Reconnecting…',
        explainer: status.reason ? `Lost the connection: ${status.reason}.` : 'Lost the connection. Trying again.',
      };
    case 'updating':
      return { tone: 'working', word: 'Updating', explainer: `Installing version ${status.to}. This takes a moment.` };
    case 'restarting':
      return {
        tone: 'working',
        word: 'Restarting',
        explainer: `FileReadWrite stopped unexpectedly. Trying again in ${status.seconds}s.`,
      };
    case 'attention':
      return { tone: 'error', word: 'Needs attention', explainer: status.message };
    case 'stopped':
    case 'setup':
      return { tone: 'idle', word: 'Stopped', explainer: "AI apps can't reach this machine." };
  }
}

export function useProfile(profile: string | null, refreshKey = 0) {
  const [details, setDetails] = useState<ProfileDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!profile) {
      setDetails(null);
      return;
    }
    let alive = true;
    api
      .profile()
      .then((next) => {
        if (!alive) return;
        setDetails(next);
        setError(null);
      })
      .catch((err) => alive && setError(errorText(err)));
    return () => {
      alive = false;
    };
  }, [profile, refreshKey]);
  return { details, error, setDetails };
}

const SHOWN_FOLDERS = 3;

export function StatusView({ snapshot, onNavigate }: { snapshot: Snapshot; onNavigate: (tab: Tab) => void }) {
  const { details, error } = useProfile(snapshot.profile);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const host = hostOf(snapshot.routerUrl);
  const { status } = snapshot;
  const view = present(status, host);
  const running = ['connected', 'connecting', 'reconnecting', 'restarting'].includes(status.kind);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const folders = details?.allowedRoots ?? [];
  const programs = details?.allowedExecutables ?? [];
  const waiting = snapshot.approvals.length;

  return (
    <div className="window-body">
      <div className="eyebrow-row">
        <div className="eyebrow">This machine</div>
        {snapshot.profiles.length > 1 && (
          <select
            className="profile-select"
            aria-label="Machine profile"
            value={snapshot.profile ?? ''}
            disabled={busy}
            onChange={(e) => run(() => api.selectProfile(e.target.value))}
          >
            {snapshot.profiles.map((profile) => (
              <option key={profile.name} value={profile.name}>
                {profile.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <section className="status-hero-card" aria-live="polite">
        <div className={`beacon ${view.tone}`}>
          <div className="beacon-core" />
        </div>
        <div className="status-word">{view.word}</div>
        <p className={`status-explainer${view.tone === 'error' ? ' error' : ''}`}>{view.explainer}</p>
        <div className="hero-actions">
          {status.kind === 'attention' && (
            <>
              <button type="button" className="btn btn-primary btn-sm btn-hero" disabled={busy} onClick={() => run(api.start)}>
                {busy ? <Spinner /> : 'Try again'}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onNavigate('logs')}>
                View logs
              </button>
            </>
          )}
          {(status.kind === 'stopped' || status.kind === 'setup') && (
            <button type="button" className="btn btn-primary btn-sm btn-hero" disabled={busy} onClick={() => run(api.start)}>
              {busy ? <Spinner /> : 'Start'}
            </button>
          )}
          {running && (
            <>
              {status.kind === 'connected' && (
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(api.restart)}>
                  Restart
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm btn-hero" disabled={busy} onClick={() => run(api.stop)}>
                {busy ? <Spinner /> : 'Stop'}
              </button>
            </>
          )}
        </div>
      </section>

      {actionError && (
        <div className="form-group">
          <Alert tone="error">{actionError}</Alert>
        </div>
      )}

      {snapshot.appUpdate && (
        <div className="form-group">
          <div className="alert alert-info update-alert" role="status">
            <Icon name="download" />
            <div>
              <strong>FileReadWrite {snapshot.appUpdate} is ready</strong>
              Installing restarts the app. Waiting commands are denied.
            </div>
            <button
              type="button"
              className="btn btn-primary btn-xs"
              disabled={busy}
              onClick={() => run(api.installAppUpdate)}
            >
              {busy ? <Spinner /> : 'Install and restart'}
            </button>
          </div>
        </div>
      )}

      {waiting > 0 && (
        <div className="form-group">
          <Alert tone="info" icon="shieldCheck">
            {waiting === 1 ? 'A command is waiting for your approval.' : `${waiting} commands are waiting for your approval.`}
          </Alert>
        </div>
      )}

      <div className="summary-grid">
        {error && <Alert tone="error">{error}</Alert>}
        <div className={`summary-card${running ? '' : ' dim'}`}>
          <div className="summary-head">
            <span className="summary-title">Folders</span>
            <button type="button" className="link" onClick={() => onNavigate('settings')}>
              Edit
            </button>
          </div>
          {folders.length === 0 && <span className="summary-empty">No folders shared.</span>}
          {folders.slice(0, SHOWN_FOLDERS).map((folder) => (
            <div key={folder} className="summary-item" title={folder}>
              <Icon name="folder" size={13} />
              <span>{folder}</span>
            </div>
          ))}
          {folders.length > SHOWN_FOLDERS && (
            <span className="summary-more">and {folders.length - SHOWN_FOLDERS} more</span>
          )}
        </div>
        <div className={`summary-card${running ? '' : ' dim'}`}>
          <div className="summary-head">
            <span className="summary-title">Programs</span>
            <button type="button" className="link" onClick={() => onNavigate('settings')}>
              Edit
            </button>
          </div>
          {programs.length === 0 ? (
            <span className="summary-empty">AI apps can't run programs here.</span>
          ) : (
            <div className="tags-row">
              {programs.map((program) => (
                <span key={program} className="tag-prog">
                  {programName(program)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="meta-footer-text">
        {[`FileReadWrite ${snapshot.appVersion}`, snapshot.version && `agent ${snapshot.version}`, host]
          .filter(Boolean)
          .join(' · ')}
      </div>
    </div>
  );
}
