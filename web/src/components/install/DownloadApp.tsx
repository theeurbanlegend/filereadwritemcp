import { useState } from 'react';
import { DOWNLOADS, PLATFORM_NAMES, detectPlatform, type Platform } from '../../lib/install';
import { Icon } from '../ui/Icon';

const ORDER: Platform[] = ['mac', 'windows', 'linux'];

export function DownloadApp() {
  const [platform, setPlatform] = useState<Platform>(detectPlatform);
  const download = DOWNLOADS[platform];

  return (
    <div className="download-app">
      <div className="download-row">
        <a className="btn btn-primary btn-sm" href={download.primary.url}>
          <Icon name="download" size={16} />
          {download.primary.label}
        </a>
        {download.others.map((other) => (
          <a key={other.url} className="btn btn-ghost btn-sm" href={other.url}>
            {other.label}
          </a>
        ))}
      </div>
      <span className="muted small">{download.firstRun}</span>
      <span className="muted small download-switch">
        Other systems:
        {ORDER.filter((p) => p !== platform).map((p) => (
          <button key={p} type="button" className="link-button" onClick={() => setPlatform(p)}>
            {PLATFORM_NAMES[p]}
          </button>
        ))}
      </span>
    </div>
  );
}
