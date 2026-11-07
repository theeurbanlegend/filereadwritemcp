import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type Status =
  | { kind: 'setup' }
  | { kind: 'stopped' }
  | { kind: 'connecting' }
  | { kind: 'connected' }
  | { kind: 'reconnecting'; reason: string }
  | { kind: 'updating'; to: string }
  | { kind: 'restarting'; seconds: number }
  | { kind: 'attention'; message: string };

export interface ProfileSummary {
  name: string;
  routerUrl: string;
}

export interface ProfileDetails extends ProfileSummary {
  allowedRoots: string[];
  allowedExecutables: string[];
  autoUpdate: boolean;
}

export interface PendingApproval {
  id: number;
  exe: string;
  args: string[];
  cwd: string;
  timeoutSec: number;
  receivedAtMs: number;
  risky: boolean;
}

export interface Snapshot {
  status: Status;
  profile: string | null;
  profiles: ProfileSummary[];
  version: string | null;
  approvals: PendingApproval[];
  routerUrl: string | null;
  appVersion: string;
  appUpdate: string | null;
}

export interface EnrollForm {
  routerUrl: string;
  code: string;
  machineName: string;
  roots: string[];
  executables: string[];
  autoUpdate: boolean;
}

export interface SettingsForm {
  roots: string[];
  executables: string[];
  autoUpdate: boolean;
}

export interface Defaults {
  routerUrl: string;
  machineName: string;
}

export const api = {
  snapshot: () => invoke<Snapshot>('get_snapshot'),
  logs: () => invoke<string[]>('get_logs'),
  defaults: () => invoke<Defaults>('defaults'),
  profile: () => invoke<ProfileDetails>('get_profile'),
  enroll: (form: EnrollForm) => invoke<string>('enroll', { form }),
  saveSettings: (form: SettingsForm, startAtLogin: boolean) =>
    invoke<ProfileDetails>('save_settings', { form, startAtLogin }),
  start: () => invoke<void>('start_agent'),
  stop: () => invoke<void>('stop_agent'),
  restart: () => invoke<void>('restart_agent'),
  selectProfile: (name: string) => invoke<void>('select_profile', { name }),
  decide: (id: number, approved: boolean) => invoke<boolean>('decide', { id, approved }),
  autostart: () => invoke<boolean>('get_autostart'),
  saveLogs: (path: string) => invoke<void>('save_logs', { path }),
  openDashboard: () => invoke<void>('open_dashboard'),
  checkAppUpdate: () => invoke<string | null>('check_app_update'),
  installAppUpdate: () => invoke<void>('install_app_update'),
};

export function onSnapshot(handler: (snapshot: Snapshot) => void): Promise<UnlistenFn> {
  return listen<Snapshot>('snapshot', (event) => handler(event.payload));
}

export function onLog(handler: (line: string) => void): Promise<UnlistenFn> {
  return listen<string>('log', (event) => handler(event.payload));
}

export function onNavigate(handler: (tab: string) => void): Promise<UnlistenFn> {
  return listen<string>('navigate', (event) => handler(event.payload));
}

export function errorText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}
