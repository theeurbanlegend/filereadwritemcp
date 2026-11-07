import { useEffect, useMemo, useState } from 'react';
import { api, errorText, type Snapshot } from '../api';
import { FolderList, ProgramChecklist, RiskNote } from '../components/AccessFields';
import { Icon } from '../components/Icon';
import { Alert, Spinner, Toggle } from '../components/controls';
import { isRisky, sameList } from '../lib';
import { useProfile } from './Status';

interface Draft {
  roots: string[];
  executables: string[];
  autoUpdate: boolean;
  startAtLogin: boolean;
}

function invalidFolder(snapshot: Snapshot, roots: string[]): string | null {
  if (snapshot.status.kind !== 'attention') return null;
  const message = snapshot.status.message;
  return roots.find((root) => message.includes(root)) ?? null;
}

function UpdatesSection({ snapshot }: { snapshot: Snapshot }) {
  const [state, setState] = useState<'idle' | 'checking' | 'installing'>('idle');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const check = async () => {
    setState('checking');
    setMessage(null);
    try {
      const found = await api.checkAppUpdate();
      if (!found) setMessage({ tone: 'success', text: `You're on the latest version.` });
    } catch (err) {
      setMessage({ tone: 'error', text: errorText(err) });
    } finally {
      setState('idle');
    }
  };

  const install = async () => {
    setState('installing');
    setMessage(null);
    try {
      await api.installAppUpdate();
    } catch (err) {
      setMessage({ tone: 'error', text: errorText(err) });
      setState('idle');
    }
  };

  return (
    <section>
      <h2 className="settings-section-title">
        <Icon name="download" size={14} />
        Updates
      </h2>
      <div className="read-only-field">
        <span>
          {snapshot.appUpdate
            ? `Version ${snapshot.appVersion} · ${snapshot.appUpdate} is ready`
            : `Version ${snapshot.appVersion}`}
        </span>
        {snapshot.appUpdate ? (
          <button type="button" className="btn btn-primary btn-xs" disabled={state !== 'idle'} onClick={install}>
            {state === 'installing' ? <Spinner /> : 'Install and restart'}
          </button>
        ) : (
          <button type="button" className="btn btn-ghost btn-xs" disabled={state !== 'idle'} onClick={check}>
            {state === 'checking' ? <Spinner /> : 'Check for updates'}
          </button>
        )}
      </div>
      {message && (
        <div className="form-group">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}
    </section>
  );
}

export function SettingsView({ snapshot }: { snapshot: Snapshot }) {
  const { details, error: loadError, setDetails } = useProfile(snapshot.profile);
  const [loginSaved, setLoginSaved] = useState<boolean | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .autostart()
      .then(setLoginSaved)
      .catch(() => setLoginSaved(false));
  }, []);

  const original = useMemo<Draft | null>(() => {
    if (!details || loginSaved === null) return null;
    return {
      roots: details.allowedRoots,
      executables: details.allowedExecutables,
      autoUpdate: details.autoUpdate,
      startAtLogin: loginSaved,
    };
  }, [details, loginSaved]);

  useEffect(() => {
    setDraft(original);
  }, [original]);

  const dirty =
    !!draft &&
    !!original &&
    (!sameList(draft.roots, original.roots) ||
      !sameList(draft.executables, original.executables) ||
      draft.autoUpdate !== original.autoUpdate ||
      draft.startAtLogin !== original.startAtLogin);

  const update = (patch: Partial<Draft>) => {
    setSaved(false);
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const save = async () => {
    if (!draft || saving) return;
    if (draft.roots.length === 0) {
      setError('Keep at least one folder so AI apps have somewhere to work.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const next = await api.saveSettings(
        { roots: draft.roots, executables: draft.executables, autoUpdate: draft.autoUpdate },
        draft.startAtLogin,
      );
      setLoginSaved(draft.startAtLogin);
      setDetails(next);
      setSaved(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const copyServer = async () => {
    if (!snapshot.routerUrl) return;
    try {
      await navigator.clipboard.writeText(snapshot.routerUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  if (!draft) {
    return (
      <div className="window-body">
        {loadError ? <Alert tone="error">{loadError}</Alert> : <div className="log-empty">Loading settings…</div>}
      </div>
    );
  }

  return (
    <>
      <div className="window-body">
        <div className="settings-panel">
          {error && <Alert tone="error">{error}</Alert>}
          {saved && !dirty && <Alert tone="success">Saved. FileReadWrite is using the new settings.</Alert>}

          <section>
            <h2 className="settings-section-title">
              <Icon name="folder" size={14} />
              Folders
            </h2>
            <FolderList
              folders={draft.roots}
              onChange={(roots) => update({ roots })}
              invalid={invalidFolder(snapshot, draft.roots)}
              confirmRemove
              disabled={saving}
            />
          </section>

          <section>
            <h2 className="settings-section-title">
              <Icon name="terminal" size={14} />
              Programs
            </h2>
            <ProgramChecklist
              selected={draft.executables}
              onChange={(executables) => update({ executables })}
              disabled={saving}
            />
            {draft.executables.some(isRisky) && (
              <div className="form-group">
                <RiskNote />
              </div>
            )}
          </section>

          <section>
            <h2 className="settings-section-title">
              <Icon name="settings" size={14} />
              General
            </h2>
            <Toggle
              label="Start at login"
              hint="Runs in the menu bar when you sign in."
              checked={draft.startAtLogin}
              disabled={saving}
              onChange={(startAtLogin) => update({ startAtLogin })}
            />
            <Toggle
              label="Install updates automatically"
              hint="FileReadWrite restarts itself after an update."
              checked={draft.autoUpdate}
              disabled={saving}
              onChange={(autoUpdate) => update({ autoUpdate })}
            />
          </section>

          <UpdatesSection snapshot={snapshot} />

          <section>
            <h2 className="settings-section-title">
              <Icon name="shieldCheck" size={14} />
              Server
            </h2>
            <div className="read-only-field">
              <span title={snapshot.routerUrl ?? ''}>{snapshot.routerUrl ?? 'Not set'}</span>
              <button type="button" className="btn btn-ghost btn-xs" disabled={!snapshot.routerUrl} onClick={copyServer}>
                <Icon name={copied ? 'check' : 'copy'} size={12} />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="form-group">
              <span className="footer-helper">
                Machine profile <strong className="mono">{snapshot.profile}</strong>.{' '}
                <button type="button" className="link" onClick={() => api.openDashboard()}>
                  Open dashboard
                </button>
              </span>
            </div>
          </section>
        </div>
      </div>
      {dirty && (
        <footer className="window-footer split">
          <span className="footer-helper">Saving restarts FileReadWrite.</span>
          <div className="hero-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={saving}
              onClick={() => {
                setError(null);
                setDraft(original);
              }}
            >
              Discard
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
              {saving ? (
                <>
                  <Spinner />
                  Saving…
                </>
              ) : (
                'Save changes'
              )}
            </button>
          </div>
        </footer>
      )}
    </>
  );
}
