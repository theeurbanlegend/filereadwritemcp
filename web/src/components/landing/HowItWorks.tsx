import { mcpUrl } from '../../lib/navigation';
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
          <h3>Install the agent</h3>
          <p>
            Run <code>frw-agent</code>, enter the code, and pick the folder it may use.
          </p>
          <InstallCommands />
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
