import type { UseMutationResult } from "@tanstack/react-query";
import { errorMessage } from "../../api/client";
import type { Agent, EnrollmentCode as Code } from "../../api/types";
import { useCountdown } from "../../hooks/useCountdown";
import { RELEASES_URL } from "../../lib/install";
import { routerUrl } from "../../lib/navigation";
import { DownloadApp } from "../install/DownloadApp";
import { InstallCommands } from "../install/InstallCommands";
import { Alert } from "../ui/Alert";
import { CopyField } from "../ui/CopyField";
import { Icon } from "../ui/Icon";
import { EnrollmentCode } from "./EnrollmentCode";

export function AddMachinePanel({
  mint,
  joined,
  onClose,
}: {
  mint: UseMutationResult<Code, Error, void>;
  joined?: Agent;
  onClose: () => void;
}) {
  const remaining = useCountdown(mint.data?.expiresAt);
  const expired = !!mint.data && remaining === 0 && !joined;

  return (
    <div className="panel">
      <div className="card-title">
        <Icon name="server" size={20} />
        <h3>Add a machine</h3>
      </div>
      {mint.error && <Alert>{errorMessage(mint.error)}</Alert>}
      {mint.isPending && (
        <p className="muted">Generating an enrollment code…</p>
      )}
      {mint.data && (
        <>
          <EnrollmentCode code={mint.data} />
          <ol className="steps">
            <li>
              <h4>Install FileReadWrite</h4>
              <DownloadApp />
            </li>
            <li>
              <h4>Paste the code and pick your folders</h4>
              <span className="muted small">
                The app asks for the code above. Hosting your own server? Set
                this address under Advanced in the app:
              </span>
              <CopyField value={routerUrl()} />
              <span className="muted small">
                The machine appears below once it connects.
              </span>
            </li>
          </ol>
          <details className="cli-fallback">
            <summary>On a server? Use the command-line agent</summary>
            <InstallCommands />
            <span className="muted small">
              Run <code>frw-agent</code> and enter the URL and code above, or
              download it from{" "}
              <a href={RELEASES_URL} target="_blank" rel="noreferrer">
                GitHub Releases
              </a>
              .
            </span>
          </details>
        </>
      )}
      <div className="panel-foot">
        {joined?.online ? (
          <span className="row gap small foot-success" role="status">
            <Icon name="check" size={16} />
            {joined.name} is connected.
          </span>
        ) : joined ? (
          <span className="row gap small" role="status">
            <span className="spinner" aria-hidden="true" />
            {joined.name} is enrolled. Waiting for it to connect…
          </span>
        ) : mint.data && !expired ? (
          <span className="row gap small">
            <span className="spinner" aria-hidden="true" />
            Waiting for the machine to connect…
          </span>
        ) : (
          <span />
        )}
        <div className="row gap">
          {(expired || mint.error) && (
            <button
              className="btn btn-primary btn-sm"
              disabled={mint.isPending}
              onClick={() => mint.mutate()}
            >
              New code
            </button>
          )}
          <button className={`btn btn-sm ${joined?.online ? 'btn-primary' : 'btn-secondary'}`} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
