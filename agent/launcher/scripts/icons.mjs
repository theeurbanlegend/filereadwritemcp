import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const brand = resolve(root, '../../web/public');
const icons = join(root, 'src-tauri/icons');
const tauri = join(root, 'node_modules/.bin/tauri');

function tauriIcon(...args) {
  execFileSync(tauri, ['icon', ...args], { cwd: root, stdio: 'inherit' });
}

tauriIcon(join(brand, 'favicon.svg'), '-o', icons);
for (const platform of ['android', 'ios']) {
  rmSync(join(icons, platform), { recursive: true, force: true });
}

const scratch = mkdtempSync(join(tmpdir(), 'frw-tray-'));
try {
  tauriIcon(join(brand, 'icon-mono.svg'), '-o', scratch, '-p', '32');
  copyFileSync(join(scratch, '32x32.png'), join(icons, 'tray-template.png'));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log(`Icons rebuilt from ${brand}`);
