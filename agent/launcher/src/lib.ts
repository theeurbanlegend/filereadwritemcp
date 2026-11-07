export const RISKY_PROGRAMS = [
  'node', 'npx', 'npm', 'yarn', 'pnpm', 'bun', 'bunx', 'deno', 'python', 'python3', 'ruby', 'perl', 'php',
  'sh', 'bash', 'zsh', 'fish', 'pwsh', 'powershell', 'cmd',
];

export interface ProgramOption {
  name: string;
  description: string;
  custom?: boolean;
}

export const COMMON_PROGRAMS: ProgramOption[] = [
  { name: 'git', description: 'Version control' },
  { name: 'cargo', description: 'Rust build tool' },
  { name: 'python', description: 'Python' },
  { name: 'node', description: 'JavaScript runtime' },
  { name: 'npm', description: 'JavaScript packages' },
  { name: 'npx', description: 'Runs JavaScript packages' },
  { name: 'yarn', description: 'JavaScript packages' },
];

export function programName(exe: string): string {
  const base = exe.split(/[\\/]/).pop() ?? exe;
  return base.toLowerCase().replace(/\.(exe|cmd|bat)$/, '');
}

export function isRisky(exe: string): boolean {
  return RISKY_PROGRAMS.includes(programName(exe));
}

export function programOptions(selected: string[]): ProgramOption[] {
  const known = new Set(COMMON_PROGRAMS.map((p) => p.name));
  const extra = selected
    .filter((name) => !known.has(name))
    .map((name) => ({ name, description: 'Added by you', custom: true }));
  return [...COMMON_PROGRAMS, ...extra];
}

const PROGRAM_NAME = /^[A-Za-z0-9._+-]+$/;

export function programNameProblem(input: string): string | null {
  const name = input.trim();
  if (!name) return 'Type the name of a program, like make.';
  if (/[\\/]/.test(name)) return 'Use just the name, like make. AI apps ask for programs by name, not by path.';
  if (/\s/.test(name)) return 'A program name has no spaces. The AI adds the arguments when it asks to run it.';
  if (!PROGRAM_NAME.test(name)) return 'Use letters, numbers, dots, dashes or underscores.';
  return null;
}

export function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'TRACE' | '';

export interface LogLine {
  time: string;
  level: LogLevel;
  source: string;
  message: string;
}

const LOG_PATTERN = /^\[(\S+)\s+(INFO|WARN|ERROR|DEBUG|TRACE)\s+([^\]]+)\]\s?(.*)$/;

export function parseLogLine(line: string): LogLine {
  const match = LOG_PATTERN.exec(line);
  if (!match) return { time: '', level: '', source: '', message: line };
  const [, stamp, level, source, message] = match;
  const date = new Date(stamp);
  const time = Number.isNaN(date.getTime())
    ? stamp
    : date.toLocaleTimeString([], { hour12: false });
  return { time, level: level as LogLevel, source: source.trim(), message };
}

export function hostOf(url: string | null): string {
  if (!url) return '';
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function todayStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
