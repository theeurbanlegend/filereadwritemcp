import { useEffect, useState, type FormEvent } from 'react';
import { api, errorText } from '../api';
import { FolderList, ProgramChecklist, RiskNote } from '../components/AccessFields';
import { Alert, Spinner, Toggle } from '../components/controls';
import { isRisky } from '../lib';

export function WelcomeView() {
  const [routerUrl, setRouterUrl] = useState('');
  const [code, setCode] = useState('');
  const [machineName, setMachineName] = useState('');
  const [roots, setRoots] = useState<string[]>([]);
  const [executables, setExecutables] = useState<string[]>([]);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    api
      .defaults()
      .then((defaults) => {
        setRouterUrl((current) => current || defaults.routerUrl);
        setMachineName((current) => current || defaults.machineName);
      })
      .catch(() => undefined);
  }, []);

  const trimmedCode = code.trim();
  const missingCode = trimmedCode.length === 0;
  const missingName = machineName.trim().length === 0;
  const missingFolders = roots.length === 0;
  const ready = !missingCode && !missingName && !missingFolders && routerUrl.trim().length > 0;

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    setTouched(true);
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.enroll({
        routerUrl: routerUrl.trim(),
        code: trimmedCode,
        machineName: machineName.trim(),
        roots,
        executables,
        autoUpdate,
      });
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <>
      <form className="window-body" id="enroll-form" onSubmit={submit}>
        <div className="eyebrow">Setup</div>
        <h1 className="window-h1 gradient-text">Add this machine</h1>
        <p className="window-lead">
          Paste the enrollment code from your{' '}
          <button type="button" className="link" onClick={() => api.openDashboard()}>
            FileReadWrite dashboard
          </button>
          , then choose what AI apps may use.
        </p>

        {error && (
          <div className="form-group">
            <Alert tone="error">{error}</Alert>
          </div>
        )}

        <div className="form-group">
          <label className="field-label" htmlFor="code">
            Enrollment code
            <span className="field-flag">REQUIRED</span>
          </label>
          <input
            id="code"
            className="input mono"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste your code"
            value={code}
            disabled={busy}
            aria-invalid={touched && missingCode}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="field-label" htmlFor="machine">
            Machine name
            <span className="field-note">Shown in the dashboard</span>
          </label>
          <input
            id="machine"
            className="input"
            autoComplete="off"
            spellCheck={false}
            value={machineName}
            disabled={busy}
            aria-invalid={touched && missingName}
            onChange={(e) => setMachineName(e.target.value)}
          />
        </div>

        <div className="form-group">
          <span className="field-label">
            Folders AI apps may use
            <span className="field-note">At least one</span>
          </span>
          <FolderList folders={roots} onChange={setRoots} disabled={busy} />
          {touched && missingFolders && <div className="row-error">Add a folder to continue.</div>}
        </div>

        <div className="form-group">
          <span className="field-label">
            Programs AI apps may run
            <span className="field-note">Each run still asks you first</span>
          </span>
          <ProgramChecklist selected={executables} onChange={setExecutables} disabled={busy} />
          {executables.some(isRisky) && <RiskNote />}
        </div>

        <details className="disclosure">
          <summary>Advanced</summary>
          <div className="form-group">
            <label className="field-label" htmlFor="router">
              Server
            </label>
            <input
              id="router"
              className="input mono"
              autoComplete="off"
              spellCheck={false}
              value={routerUrl}
              disabled={busy}
              onChange={(e) => setRouterUrl(e.target.value)}
            />
          </div>
          <Toggle
            label="Install updates automatically"
            hint="FileReadWrite restarts itself after an update."
            checked={autoUpdate}
            disabled={busy}
            onChange={setAutoUpdate}
          />
        </details>
      </form>
      <footer className="window-footer">
        <button type="submit" form="enroll-form" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? (
            <>
              <Spinner />
              Connecting…
            </>
          ) : (
            'Connect this machine'
          )}
        </button>
      </footer>
    </>
  );
}
