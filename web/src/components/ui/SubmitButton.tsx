import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button className="btn btn-primary btn-block btn-lg" disabled={pending}>
      {children}
      {!pending && <Icon name="arrowRight" size={16} />}
    </button>
  );
}
