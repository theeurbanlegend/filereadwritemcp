import type { ReactNode } from 'react';
import { useTitle } from '../../hooks/useTitle';
import { Icon, type IconName } from '../ui/Icon';

interface Props {
  title: string;
  subtitle?: ReactNode;
  eyebrow?: string;
  icon?: IconName;
  top?: ReactNode;
  children: ReactNode;
}

export function AuthCard({ title, subtitle, eyebrow, icon, top, children }: Props) {
  useTitle(title);
  return (
    <div className="auth">
      <div className="card auth-card">
        <div className="auth-head">
          {top}
          {icon && (
            <div className="auth-icon">
              <Icon name={icon} size={26} />
            </div>
          )}
          {eyebrow && <div className="eyebrow eyebrow-lines">{eyebrow}</div>}
          <h1 className="gradient-text">{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
