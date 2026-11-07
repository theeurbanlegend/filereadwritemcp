import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PLATFORMS = {
  'darwin-aarch64': 'FileReadWrite-macos-arm64.app.tar.gz',
  'darwin-x86_64': 'FileReadWrite-macos-x64.app.tar.gz',
  'windows-x86_64': 'FileReadWrite-windows-x64-setup.exe',
  'linux-x86_64': 'FileReadWrite-linux-x64.AppImage',
};

function arg(name) {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : undefined;
}

const dir = resolve(arg('--dir') ?? 'release');
const tag = arg('--tag');
const repo = arg('--repo');
if (!tag || !repo) {
  console.error('Usage: latest-json.mjs --dir <assets> --tag <vX.Y.Z> --repo <owner/name>');
  process.exit(1);
}

const platforms = {};
for (const [platform, file] of Object.entries(PLATFORMS)) {
  const sig = join(dir, `${file}.sig`);
  if (!existsSync(join(dir, file)) || !existsSync(sig)) continue;
  platforms[platform] = {
    signature: readFileSync(sig, 'utf8').trim(),
    url: `https://github.com/${repo}/releases/download/${tag}/${file}`,
  };
}

if (Object.keys(platforms).length === 0) {
  console.log('No signed launcher bundles, so no latest.json');
  process.exit(0);
}

const manifest = {
  version: tag.replace(/^v/, ''),
  notes: `https://github.com/${repo}/releases/tag/${tag}`,
  pub_date: new Date().toISOString(),
  platforms,
};
writeFileSync(join(dir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`latest.json for ${Object.keys(platforms).join(', ')}`);
