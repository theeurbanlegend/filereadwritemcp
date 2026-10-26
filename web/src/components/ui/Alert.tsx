import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

const ICONS: Record<'error' | 'success' | 'info', IconName> = { error: 'alert', success: 'check', info: 'info' };

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info'; children: ReactNode }) {
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon name={ICONS[kind]} size={16} />
      <div>{children}</div>
    </div>
  );
}
