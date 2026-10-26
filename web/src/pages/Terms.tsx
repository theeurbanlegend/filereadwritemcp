import { Link } from 'react-router-dom';
import { useTitle } from '../hooks/useTitle';
import { GITHUB_URL, SITE } from '../lib/site';

export default function Terms() {
  useTitle('Terms of Service');
  const host = window.location.host;
  return (
    <article className="legal">
      <h1>Terms of Service</h1>
      <p className="muted">Last updated {SITE.legalUpdated}</p>

      <p>
        These terms cover your use of the FileReadWrite service at <strong>{host}</strong> (“the service”), run by{' '}
        {SITE.operator} (“we”). By creating an account or using the service, you agree to them. Our{' '}
        <Link to="/privacy">Privacy Policy</Link> explains how we handle your data.
      </p>

      <h2>What the service does</h2>
      <p>
        The service lets AI clients that support the Model Context Protocol (MCP) read, write and search files, and
        run programs you approve, on machines where you've installed the FileReadWrite agent. You decide which
        folders and programs each machine allows, and you approve each command on the machine itself.
      </p>
      <p>
        The FileReadWrite software is open source and has its own licenses (MIT for the agent, AGPL-3.0 for the
        router; see{' '}
        <a href={GITHUB_URL} target="_blank" rel="noreferrer">
          GitHub
        </a>
        ). These terms cover the hosted service, not your use of the code.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must be at least 16 and able to agree to these terms.</li>
        <li>Give us a real email address you control, and keep your password and enrollment codes private.</li>
        <li>You're responsible for activity on your account and the machines you enroll in it.</li>
        <li>Only enroll machines you own or are allowed to connect.</li>
      </ul>

      <h2>You're in control, and responsible</h2>
      <p>
        AI clients can make mistakes, misread instructions, or be manipulated by content they read (for example a
        file or web page containing hidden instructions). The service does what your AI client asks within the limits
        you set. So:
      </p>
      <ul>
        <li>Only allow folders and programs you're comfortable with an AI accessing.</li>
        <li>Read each command before approving it.</li>
        <li>Keep backups of anything important. Deleted files are gone.</li>
      </ul>
      <p>
        You're responsible for the files, commands and results that flow through your account, and for complying with
        any obligations that apply to that data.
      </p>

      <h2>Acceptable use</h2>
      <p>Don't use the service to:</p>
      <ul>
        <li>break the law or infringe anyone's rights;</li>
        <li>access machines or data you're not authorized to access;</li>
        <li>attack, probe or overload the service, or get around its limits and security controls;</li>
        <li>distribute malware or run abusive automation;</li>
        <li>resell or provide the hosted service to others without our permission.</li>
      </ul>
      <p>
        Found a security issue? Report it privately under our{' '}
        <a href={`${GITHUB_URL}/security/policy`} target="_blank" rel="noreferrer">
          security policy
        </a>{' '}
        instead of testing it on other people's accounts.
      </p>

      <h2>Limits and changes to the service</h2>
      <p>
        The service has usage limits (for example the number of machines and tool calls per minute) to keep it
        reliable for everyone. We may change features or limits, and we'll give notice of significant changes where we
        reasonably can.
      </p>

      <h2>Suspension and ending your account</h2>
      <p>
        You can delete your account at any time in <Link to="/settings">Settings</Link>. We may suspend or close
        accounts that break these terms or put the service or others at risk. Where it's reasonable, we'll tell you
        why first.
      </p>

      <h2>No warranty</h2>
      <p>
        The service is provided “as is” and “as available”, without warranties of any kind, including fitness for a
        particular purpose and uninterrupted or error-free operation, to the extent the law allows.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the extent the law allows, we aren't liable for indirect, incidental or consequential damages, or for lost
        data, files or profits, arising from your use of the service, including actions taken by AI clients through
        it. Our total liability for any claim is limited to the amount you paid us for the service in the 12 months
        before the claim (which is zero while the service is free). Nothing here limits liability that can't be
        limited by law.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        We may update these terms. We'll change the date above, and email account holders about significant changes
        before they take effect. Continuing to use the service after that means you accept the new terms.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of {SITE.jurisdiction}, without regard to conflict-of-law rules. This
        doesn't take away any consumer protections you have where you live.
      </p>

      <h2>Contact</h2>
      <p>
        {SITE.operator} · <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
      </p>
    </article>
  );
}
