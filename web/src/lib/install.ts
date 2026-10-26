import { SITE } from './site';

const GITHUB_REPO = SITE.githubRepo;
const RAW = `https://raw.githubusercontent.com/${GITHUB_REPO}/main`;

export const RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;
export const INSTALL_UNIX = `curl -fsSL ${RAW}/install.sh | sh`;
export const INSTALL_WINDOWS = `irm ${RAW}/install.ps1 | iex`;
