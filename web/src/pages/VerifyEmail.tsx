import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { AuthCard } from '../components/auth/AuthCard';
import { Alert } from '../components/ui/Alert';
import { useResendVerification } from '../hooks/mutations/auth';
import { useEmailVerification } from '../hooks/queries/auth';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const verify = useEmailVerification(token);
  const resend = useResendVerification();

  useEffect(() => {
    if (verify.isSuccess) navigate('/dashboard', { replace: true });
  }, [verify.isSuccess, navigate]);

  if (token && !verify.isError) {
    return (
      <AuthCard icon="mail" title="Verifying your email…">
        <p className="muted">One moment.</p>
      </AuthCard>
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    resend.mutate(email);
  }

  return (
    <AuthCard icon="alert" title="Verification failed">
      <Alert>{token ? errorMessage(verify.error) : 'This link is missing its token.'}</Alert>
      <p className="muted small">The link may have expired or already been used. Enter your email to get a new one.</p>
      {resend.isSuccess ? (
        <Alert kind="success">If that account needs verifying, a new link is on its way.</Alert>
      ) : (
        <form onSubmit={submit} className="form">
          <label>
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="btn btn-primary btn-block" disabled={resend.isPending}>
            Resend verification email
          </button>
        </form>
      )}
      <p className="auth-foot">
        <Link to="/login">Back to sign in</Link>
      </p>
    </AuthCard>
  );
}
