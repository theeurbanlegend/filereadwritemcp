import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { AuthCard } from '../components/auth/AuthCard';
import { NewPasswordFields } from '../components/auth/NewPasswordFields';
import { Alert } from '../components/ui/Alert';
import { SubmitButton } from '../components/ui/SubmitButton';
import { useResetPassword } from '../hooks/mutations/auth';
import { newPasswordError } from '../lib/password';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const reset = useResetPassword();

  if (!token) {
    return (
      <AuthCard icon="alert" title="Invalid link">
        <Alert>This reset link is missing its token.</Alert>
        <Link to="/forgot-password" className="btn btn-secondary btn-block">
          Request a new link
        </Link>
      </AuthCard>
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const problem = newPasswordError(password, confirm);
    setLocalError(problem);
    if (!problem) reset.mutate({ token: token!, password }, { onSuccess: () => navigate('/dashboard', { replace: true }) });
  }

  return (
    <AuthCard icon="key" title="Choose a new password">
      {(localError || reset.error) && (
        <Alert>
          {localError ?? errorMessage(reset.error)}
          {reset.error && (
            <>
              {' '}
              <Link to="/forgot-password">Request a new link</Link>
            </>
          )}
        </Alert>
      )}
      <form onSubmit={submit} className="form">
        <NewPasswordFields
          label="New password"
          password={password}
          confirm={confirm}
          onPasswordChange={setPassword}
          onConfirmChange={setConfirm}
        />
        <SubmitButton pending={reset.isPending}>Save password and sign in</SubmitButton>
      </form>
    </AuthCard>
  );
}
