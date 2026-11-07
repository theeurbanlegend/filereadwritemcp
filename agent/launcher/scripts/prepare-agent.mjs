import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const release = process.argv.includes('--release');
const here = dirname(fileURLToPath(import.meta.url));
const agentDir = join(here, '..', '..', 'binary');
const outDir = join(here, '..', 'src-tauri', 'binaries');

const triple =
  process.env.TAURI_ENV_TARGET_TRIPLE ??
  execFileSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf8' }).trim();
const ext = triple.includes('windows') ? '.exe' : '';

const cargoArgs = ['build', '--manifest-path', join(agentDir, 'Cargo.toml'), '--target', triple];
if (release) cargoArgs.push('--release');
execFileSync('cargo', cargoArgs, { stdio: 'inherit' });

const built = join(agentDir, 'target', triple, release ? 'release' : 'debug', `agent-binary${ext}`);
if (!existsSync(built)) {
  console.error(`Agent build output not found: ${built}`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const target = join(outDir, `frw-agent-${triple}${ext}`);
copyFileSync(built, target);
if (!ext) chmodSync(target, 0o755);
console.log(`Agent ready: ${target}`);
