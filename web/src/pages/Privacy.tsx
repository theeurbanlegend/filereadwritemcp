import { Link } from 'react-router-dom';
import { useTitle } from '../hooks/useTitle';
import { GITHUB_URL, SITE } from '../lib/site';

export default function Privacy() {
  useTitle('Privacy Policy');
  const host = window.location.host;
  return (
    <article className="legal">
      <h1>Privacy Policy</h1>
      <p className="muted">Last updated {SITE.legalUpdated}</p>

      <p>
        This policy explains what the FileReadWrite service at <strong>{host}</strong> (“the service”) collects
        and why. It is run by {SITE.operator} (“we”). FileReadWrite is open source; if you use an instance someone
        else hosts, that operator's policy applies instead.
      </p>

      <h2>The short version</h2>
      <ul>
        <li>We keep what's needed to run your account: your email, your machines, and the apps you've connected.</li>
        <li>
          File contents, file listings, command output and the requests your AI client sends pass through our server
          on their way between your AI client and your machine. We don't store them, log them, or look at them.
        </li>
        <li>No ads, no analytics, no tracking cookies. We don't sell your data or use it to train AI models.</li>
        <li>You can delete your account and its data at any time from Settings.</li>
      </ul>

      <h2>What we collect</h2>
      <h3>Your account</h3>
      <ul>
        <li>Your email address and whether you've verified it.</li>
        <li>
          Your password, stored only as a salted <code>scrypt</code> hash. We can't see your password.
        </li>
        <li>
          If you sign in with GitHub: your GitHub account ID and the verified primary email GitHub gives us. We
          don't keep your GitHub access token.
        </li>
        <li>When your account was created.</li>
      </ul>
      <h3>Your machines and connected apps</h3>
      <ul>
        <li>The name you give each machine, its ID, when it was enrolled and when it was last online.</li>
        <li>
          For each MCP client you approve (for example Claude, ChatGPT or Cursor): the name it registers with, its
          redirect address, and when you last authorized it.
        </li>
        <li>Session and access tokens, stored only as hashes.</li>
      </ul>
      <p>
        The folders and programs a machine may access are configured on that machine and stay there. We only see
        them when your AI client asks the machine for them.
      </p>
      <h3>Technical data</h3>
      <ul>
        <li>
          IP addresses, kept in memory for rate limiting and lockouts. They appear in our server logs only when an
          address is being throttled. We don't keep access logs of your requests.
        </li>
        <li>
          Server logs that include account and machine IDs when machines connect and disconnect, and your email
          address if an email to you fails to send. Logs rotate automatically.
        </li>
      </ul>

      <h2>What passes through but isn't stored</h2>
      <p>
        When your AI client calls a tool, the request and the result (file contents, folder listings, search results,
        command output) travel from your AI client to our server and on to your machine, and back. They're encrypted
        in transit with TLS, and our server handles them in memory only to forward them. They aren't end-to-end
        encrypted, so the service could technically read them while forwarding them; we don't. If you'd rather nothing
        pass through us at all, you can{' '}
        <a href={`${GITHUB_URL}/blob/main/router/README.md`} target="_blank" rel="noreferrer">
          host your own router
        </a>
        .
      </p>
      <p>
        Your AI client's provider (for example Anthropic, OpenAI or Cursor) receives whatever your AI reads or runs
        through FileReadWrite. How they handle it is covered by their own privacy policies.
      </p>

      <h2>Cookies</h2>
      <p>
        We use one cookie to keep you signed in (<code>frw_session</code>), and a short-lived cookie during GitHub
        sign-in to protect against forged logins. Both are strictly necessary for the service to work. There are no
        analytics or advertising cookies.
      </p>

      <h2>How we use your data</h2>
      <ul>
        <li>To run the service: sign you in, connect your MCP clients to your machines, and show your dashboard.</li>
        <li>To send account emails: verification links and password resets. We don't send marketing email.</li>
        <li>To keep the service safe: rate limits, lockouts after failed sign-ins, and preventing abuse.</li>
      </ul>

      <h2>Who we share it with</h2>
      <p>We don't sell or rent your data. We use these providers to run the service:</p>
      <ul>
        <li>
          <strong>{SITE.hostingProvider}</strong>: hosts our servers and database.
        </li>
        <li>
          <strong>Resend</strong>: sends verification and password-reset emails, so it receives your email address.
        </li>
        <li>
          <strong>GitHub</strong>: if you sign in with GitHub, and when the agent downloads updates from GitHub
          Releases.
        </li>
      </ul>
      <p>We'll disclose data if the law requires it, and only as much as required.</p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Account, machine and app data: until you delete them or your account.</li>
        <li>Sessions last 30 days; expired sessions, tokens and enrollment codes are deleted automatically.</li>
        <li>
          Deleting your account removes it, your machines, sessions and tokens immediately. Copies may remain in
          database backups for up to {SITE.backupRetentionDays} days before they're overwritten.
        </li>
      </ul>

      <h2>Your choices and rights</h2>
      <p>
        You can see your account details and connected machines and apps on your dashboard, revoke any of them, and
        delete your account in <Link to="/settings">Settings</Link>. For anything else, including a copy of your data
        or a correction, email <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>. Depending on where you
        live (for example the EU, UK or California) you may have further rights, such as objecting to processing or
        complaining to a data protection authority; we'll honor them.
      </p>

      <h2>Security</h2>
      <p>
        Passwords and tokens are hashed, connections use TLS, and every command your AI wants to run needs your
        approval on your machine. Found a security problem? Please report it privately; see our{' '}
        <a href={`${GITHUB_URL}/security/policy`} target="_blank" rel="noreferrer">
          security policy
        </a>
        .
      </p>

      <h2>Children</h2>
      <p>The service isn't meant for anyone under 16, and we don't knowingly collect their data.</p>

      <h2>Changes</h2>
      <p>
        If we change this policy, we'll update the date above. For significant changes we'll email account holders
        before they take effect.
      </p>

      <h2>Contact</h2>
      <p>
        {SITE.operator} · <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
      </p>
    </article>
  );
}
