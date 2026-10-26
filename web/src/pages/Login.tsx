import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage, hasStatus } from '../api/client';
import { AuthCard } from '../components/auth/AuthCard';
import { GithubSignIn } from '../components/auth/GithubSignIn';
import { Alert } from '../components/ui/Alert';
import { SubmitButton } from '../components/ui/SubmitButton';
import { useLogin, useResendVerification } from '../hooks/mutations/auth';
import { safeNext, withNext } from '../lib/navigation';

export default function Login() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const resend = useResendVerification();

  const unverified = hasStatus(login.error, 403, 'email_not_verified');

  function submit(e: FormEvent) {
    e.preventDefault();
    resend.reset();
    login.mutate(
      { email, password },
      {
        onSuccess: () => {
          if (next) window.location.href = next;
          else navigate('/dashboard', { replace: true });
        },
      },
    );
  }

  return (
    <AuthCard eyebrow="Welcome back" title="Sign in" subtitle="Access your machines from any MCP client.">
      {unverified ? (
        <Alert kind="info">
          Verify your email before signing in. Check your inbox for the link.{' '}
          {resend.isSuccess ? (
            <strong>Sent. Check your inbox.</strong>
          ) : (
            <button className="link" disabled={resend.isPending} onClick={() => resend.mutate(email)}>
              Resend email
            </button>
          )}
        </Alert>
      ) : (
        login.error && (
          <Alert>{hasStatus(login.error, 401) ? 'Wrong email or password.' : errorMessage(login.error)}</Alert>
        )
      )}
      <GithubSignIn next={next} />
      <form onSubmit={submit} className="form">
        <label>
          Email
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          <span className="label-row">
            Password
            <Link to="/forgot-password" className="small">
              Forgot password?
            </Link>
          </span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <SubmitButton pending={login.isPending}>{login.isPending ? 'Signing in…' : 'Sign in'}</SubmitButton>
      </form>
      <p className="auth-foot">
        No account? <Link to={withNext('/signup', next)}>Create one</Link>
      </p>
    </AuthCard>
  );
}
