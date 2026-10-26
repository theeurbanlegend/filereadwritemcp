import { mcpUrl } from '../../lib/navigation';
import { CopyField } from '../ui/CopyField';

export function ConnectCard() {
  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <span className="dot" />
          <h2>Connect your MCP client</h2>
        </div>
        <span className="tag">Streamable HTTP</span>
      </div>
      <p className="muted">
        Add a remote MCP server in Claude, Cursor or any MCP client using this URL. You'll be asked to sign in and
        approve access.
      </p>
      <CopyField value={mcpUrl()} icon="terminal" label="Copy URL" />
    </section>
  );
}
