import { mcpUrl } from '../../lib/navigation';
import { DownloadApp } from '../install/DownloadApp';
import { InstallCommands } from '../install/InstallCommands';
import { CopyField } from '../ui/CopyField';
import { Icon } from '../ui/Icon';
import { SectionHead } from './SectionHead';

export function HowItWorks() {
  return (
    <section id="how">
      <SectionHead eyebrow="How it works" title="Three steps to your first machine">
        Create an account, install the agent where your files live, and point your AI client at it.
      </SectionHead>
      <div className="step-cards">
        <div className="card step-card">
          <div className="step-card-top">
            <span className="tag">01</span>
            <Icon name="user" />
          </div>
          <h3>Create an account</h3>
          <p>Sign up with email or GitHub, then click “Add a machine” for a one-time enrollment code.</p>
        </div>
        <div className="card step-card">
          <div className="step-card-top">
            <span className="tag">02</span>
            <Icon name="terminal" />
          </div>
          <h3>Install FileReadWrite</h3>
          <p>Open the app, paste the code, and pick the folders AI apps may use.</p>
          <DownloadApp />
          <details className="cli-fallback">
            <summary>On a server? Install the command-line agent</summary>
            <InstallCommands />
          </details>
        </div>
        <div className="card step-card">
          <div className="step-card-top">
            <span className="tag">03</span>
            <Icon name="swap" />
          </div>
          <h3>Connect your AI client</h3>
          <p>Add a remote MCP server with this URL, then sign in and approve it.</p>
          <CopyField value={mcpUrl()} />
        </div>
      </div>
    </section>
  );
}
