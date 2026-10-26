import { Icon, type IconName } from '../ui/Icon';
import { SectionHead } from './SectionHead';

const FEATURES = [
  {
    icon: 'folder' as IconName,
    title: 'You choose what it can touch',
    body: 'Each machine has its own list of allowed folders and programs, kept on that machine. Paths outside it are refused, including ../ and symlink tricks.',
  },
  {
    icon: 'shieldCheck' as IconName,
    title: 'Every command needs your OK',
    body: 'Before anything runs, a dialog on your machine shows the exact command. Nothing runs if you say no or step away.',
  },
  {
    icon: 'lock' as IconName,
    title: 'No open ports',
    body: 'The agent connects out to the router, so it works behind home routers, office firewalls and NAT without any setup.',
  },
  {
    icon: 'hub' as IconName,
    title: 'All your machines, one connection',
    body: 'Connect your laptop, desktop and servers to one account. Your AI client lists them and picks the right one.',
  },
  {
    icon: 'fingerprint' as IconName,
    title: 'Edits that don’t clobber',
    body: 'Writes include a fingerprint of the file the AI read. If the file changed since, the write is refused instead of overwriting your work.',
  },
  {
    icon: 'code' as IconName,
    title: 'Open source, self-hostable',
    body: 'Read every line of the agent and router. Prefer your files never touch our servers? Run your own router.',
  },
];

export function FeatureGrid() {
  return (
    <section id="security">
      <SectionHead eyebrow="Security" title="Built to be safe by default">
        Your machine stays in charge of what the AI can see and do.
      </SectionHead>
      <div className="features">
        {FEATURES.map((f) => (
          <div className="card feature" key={f.title}>
            <span className="icon-tile">
              <Icon name={f.icon} />
            </span>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
