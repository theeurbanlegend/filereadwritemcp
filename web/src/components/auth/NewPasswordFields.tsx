import { MIN_PASSWORD } from '../../lib/password';

interface Props {
  label?: string;
  password: string;
  confirm: string;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
}

export function NewPasswordFields({ label = 'Password', password, confirm, onPasswordChange, onConfirmChange }: Props) {
  return (
    <>
      <label>
        {label}
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
        />
        <span className="hint">At least {MIN_PASSWORD} characters.</span>
      </label>
      <label>
        Confirm password
        <input
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => onConfirmChange(e.target.value)}
        />
      </label>
    </>
  );
}
