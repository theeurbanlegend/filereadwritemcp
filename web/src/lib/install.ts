import { SITE } from './site';

const GITHUB_REPO = SITE.githubRepo;
const RAW = `https://raw.githubusercontent.com/${GITHUB_REPO}/main`;

export const RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;

export type Platform = 'mac' | 'windows' | 'linux';

export interface Download {
  label: string;
  url: string;
}

const asset = (file: string) => `${RELEASES_URL}/download/${file}`;

export const DOWNLOADS: Record<Platform, { primary: Download; others: Download[]; firstRun: string }> = {
  mac: {
    primary: { label: 'Download for Mac', url: asset('FileReadWrite-macos-arm64.dmg') },
    others: [{ label: 'Intel Mac', url: asset('FileReadWrite-macos-x64.dmg') }],
    firstRun:
      'If macOS says it can’t check the app, open System Settings → Privacy & Security and click Open Anyway.',
  },
  windows: {
    primary: { label: 'Download for Windows', url: asset('FileReadWrite-windows-x64-setup.exe') },
    others: [],
    firstRun: 'If Windows shows “Windows protected your PC”, click More info → Run anyway.',
  },
  linux: {
    primary: { label: 'Download AppImage', url: asset('FileReadWrite-linux-x64.AppImage') },
    others: [{ label: '.deb package', url: asset('FileReadWrite-linux-x64.deb') }],
    firstRun: 'Make the AppImage executable (chmod +x) before opening it.',
  },
};

export const PLATFORM_NAMES: Record<Platform, string> = {
  mac: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
};

export function detectPlatform(): Platform {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const hint = `${nav.userAgentData?.platform ?? ''} ${navigator.userAgent}`.toLowerCase();
  if (hint.includes('win')) return 'windows';
  if ((hint.includes('linux') || hint.includes('x11')) && !hint.includes('android')) return 'linux';
  return 'mac';
}
export const INSTALL_UNIX = `curl -fsSL ${RAW}/install.sh | sh`;
export const INSTALL_WINDOWS = `irm ${RAW}/install.ps1 | iex`;
