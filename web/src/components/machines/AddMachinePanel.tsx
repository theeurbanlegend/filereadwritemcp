import type { UseMutationResult } from "@tanstack/react-query";
import { errorMessage } from "../../api/client";
import type { EnrollmentCode as Code } from "../../api/types";
import { useCountdown } from "../../hooks/useCountdown";
import { RELEASES_URL } from "../../lib/install";
import { routerUrl } from "../../lib/navigation";
import { InstallCommands } from "../install/InstallCommands";
import { Alert } from "../ui/Alert";
import { CopyField } from "../ui/CopyField";
import { Icon } from "../ui/Icon";
import { EnrollmentCode } from "./EnrollmentCode";

export function AddMachinePanel({
  mint,
  onClose,
}: {
  mint: UseMutationResult<Code, Error, void>;
  onClose: () => void;
}) {
  const remaining = useCountdown(mint.data?.expiresAt);
  const expired = !!mint.data && remaining === 0;

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
              <h4>Install the agent</h4>
              <InstallCommands />
              <span className="muted small">
                Or download it from{" "}
                <a href={RELEASES_URL} target="_blank" rel="noreferrer">
                  GitHub Releases
                </a>
                .
              </span>
            </li>
            <li>
              <h4>
                Run <code>frw-agent</code>
              </h4>
              <span className="muted small">
                When asked, enter this router URL and the code above.
              </span>
              <CopyField value={routerUrl()} />
            </li>
            <li>
              <h4>Pick the folder the agent may access</h4>
              <span className="muted small">
                The machine appears below once it connects.
              </span>
            </li>
          </ol>
        </>
      )}
      <div className="panel-foot">
        {mint.data && !expired ? (
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
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
