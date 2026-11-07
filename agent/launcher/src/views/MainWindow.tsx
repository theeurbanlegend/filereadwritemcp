import { useEffect, useState } from 'react';
import { onNavigate } from '../api';
import { BrandMark } from '../components/Icon';
import { useSnapshot } from '../hooks';
import { LogsView } from './Logs';
import { SettingsView } from './Settings';
import { StatusView } from './Status';
import { WelcomeView } from './Welcome';

export type Tab = 'status' | 'settings' | 'logs';

const TABS: { id: Tab; label: string }[] = [
  { id: 'status', label: 'Status' },
  { id: 'settings', label: 'Settings' },
  { id: 'logs', label: 'Logs' },
];

function isTab(value: string): value is Tab {
  return TABS.some((tab) => tab.id === value);
}

export function MainWindow() {
  const snapshot = useSnapshot();
  const [tab, setTab] = useState<Tab>('status');

  useEffect(() => {
    const unlisten = onNavigate((next) => {
      if (isTab(next)) setTab(next);
    });
    return () => {
      unlisten.then((stop) => stop());
    };
  }, []);

  if (!snapshot) {
    return <div className="window" />;
  }

  const needsSetup = snapshot.status.kind === 'setup' || !snapshot.profile;

  return (
    <div className={`window${needsSetup ? ' glow' : ''}`}>
      <header className="app-header">
        <div className="brand">
          <BrandMark />
          <span className="brand-name">FileReadWrite</span>
        </div>
        {!needsSetup && (
          <nav className="segmented-tabs" role="tablist" aria-label="Sections">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={`tab-item${tab === item.id ? ' active' : ''}`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
                {item.id === 'status' && snapshot.status.kind === 'attention' && (
                  <span className="tab-badge" aria-label="needs attention">!</span>
                )}
              </button>
            ))}
          </nav>
        )}
      </header>
      {needsSetup ? (
        <WelcomeView />
      ) : tab === 'status' ? (
        <StatusView snapshot={snapshot} onNavigate={setTab} />
      ) : tab === 'settings' ? (
        <SettingsView snapshot={snapshot} />
      ) : (
        <LogsView />
      )}
    </div>
  );
}
