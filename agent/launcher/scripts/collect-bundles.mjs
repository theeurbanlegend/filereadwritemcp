import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SLUGS = {
  'aarch64-apple-darwin': 'macos-arm64',
  'x86_64-apple-darwin': 'macos-x64',
  'x86_64-pc-windows-msvc': 'windows-x64',
  'x86_64-unknown-linux-gnu': 'linux-x64',
};

const KINDS = [
  { dir: 'dmg', suffix: '.dmg' },
  { dir: 'macos', suffix: '.app.tar.gz' },
  { dir: 'nsis', suffix: '-setup.exe' },
  { dir: 'appimage', suffix: '.AppImage' },
  { dir: 'deb', suffix: '.deb' },
];

function arg(name) {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : undefined;
}

const target = arg('--target');
const out = resolve(arg('--out') ?? 'release');
const slug = SLUGS[target];
if (!slug) {
  console.error(`Unknown target ${target}. Expected one of: ${Object.keys(SLUGS).join(', ')}`);
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = join(root, 'src-tauri', 'target', target, 'release', 'bundle');
mkdirSync(out, { recursive: true });

const collected = [];
for (const { dir, suffix } of KINDS) {
  const from = join(bundle, dir);
  if (!existsSync(from)) continue;
  for (const file of readdirSync(from)) {
    if (!file.endsWith(suffix)) continue;
    const name = `FileReadWrite-${slug}${suffix}`;
    copyFileSync(join(from, file), join(out, name));
    collected.push(name);
    if (existsSync(join(from, `${file}.sig`))) {
      copyFileSync(join(from, `${file}.sig`), join(out, `${name}.sig`));
      collected.push(`${name}.sig`);
    }
  }
}

if (collected.length === 0) {
  console.error(`No bundles found in ${bundle}`);
  process.exit(1);
}
console.log(collected.map((name) => `  ${name}`).join('\n'));
