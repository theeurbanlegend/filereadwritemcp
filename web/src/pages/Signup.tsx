import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { AuthCard } from '../components/auth/AuthCard';
import { GithubSignIn } from '../components/auth/GithubSignIn';
import { NewPasswordFields } from '../components/auth/NewPasswordFields';
import { Alert } from '../components/ui/Alert';
import { SubmitButton } from '../components/ui/SubmitButton';
import { useSignup } from '../hooks/mutations/auth';
import { safeNext, withNext } from '../lib/navigation';
import { newPasswordError } from '../lib/password';

export default function Signup() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const signup = useSignup();

  function submit(e: FormEvent) {
    e.preventDefault();
    const problem = newPasswordError(password, confirm);
    setLocalError(problem);
    if (!problem) signup.mutate({ email, password });
  }

  if (signup.isSuccess) {
    return (
      <AuthCard icon="mail" title="Check your email">
        <p>
          We sent a verification link to <strong>{email}</strong>. Open it to finish creating your account.
        </p>
        <p className="muted small">Didn't get it? Check spam, or sign in later to resend it.</p>
        <Link to="/login" className="btn btn-secondary btn-block">
          Back to sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard eyebrow="Get started" title="Create your account" subtitle="Connect AI clients to files on your own machines.">
      {(localError || signup.error) && <Alert>{localError ?? errorMessage(signup.error)}</Alert>}
      <GithubSignIn next={next} label="Sign up with GitHub" />
      <form onSubmit={submit} className="form">
        <label>
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <NewPasswordFields
          password={password}
          confirm={confirm}
          onPasswordChange={setPassword}
          onConfirmChange={setConfirm}
        />
        <SubmitButton pending={signup.isPending}>{signup.isPending ? 'Creating account…' : 'Create account'}</SubmitButton>
      </form>
      <p className="muted small center-text">
        By creating an account you agree to the <Link to="/terms">Terms</Link> and{' '}
        <Link to="/privacy">Privacy Policy</Link>.
      </p>
      <p className="auth-foot">
        Already have an account? <Link to={withNext('/login', next)}>Sign in</Link>
      </p>
    </AuthCard>
  );
}
