import { useRef } from 'react';
import type { EnrollmentCode as Code } from '../../api/types';
import { useCountdown } from '../../hooks/useCountdown';
import { CopyField } from '../ui/CopyField';

export function EnrollmentCode({ code }: { code: Code }) {
  const remaining = useCountdown(code.expiresAt);
  const total = useRef(0);
  if (remaining > total.current) total.current = remaining;
  const expired = remaining === 0;
  const pct = total.current ? (remaining / total.current) * 100 : 0;
  const clock = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;

  return (
    <div className="enroll-box">
      <div className="row gap wrap" style={{ justifyContent: 'space-between' }}>
        <span className="eyebrow">Enrollment code</span>
        <span className="muted small">Works once</span>
      </div>
      <CopyField value={code.code} label="Copy code" className={`enroll-code${expired ? ' expired' : ''}`} />
      <div>
        <p className={`small ${expired ? 'error' : 'muted'}`} style={{ margin: '0 0 0.4rem' }} aria-live="polite">
          {expired ? 'This code has expired. Get a new one below.' : <>Expires in <strong>{clock}</strong></>}
        </p>
        <div className="meter-track wide">
          <div className="meter-fill countdown" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
