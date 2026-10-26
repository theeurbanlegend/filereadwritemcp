import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { AuthCard } from '../components/auth/AuthCard';
import { Alert } from '../components/ui/Alert';
import { Icon } from '../components/ui/Icon';
import { SubmitButton } from '../components/ui/SubmitButton';
import { useForgotPassword } from '../hooks/mutations/auth';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const forgot = useForgotPassword();

  function submit(e: FormEvent) {
    e.preventDefault();
    forgot.mutate(email);
  }

  return (
    <AuthCard icon="key" title="Reset your password" subtitle="We'll email you a link to choose a new one.">
      {forgot.isSuccess ? (
        <Alert kind="success">If an account exists for {email}, a reset link is on its way.</Alert>
      ) : (
        <>
          {forgot.error && <Alert>{errorMessage(forgot.error)}</Alert>}
          <form onSubmit={submit} className="form">
            <label>
              Email
              <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <SubmitButton pending={forgot.isPending}>Send reset link</SubmitButton>
          </form>
        </>
      )}
      <p className="auth-foot">
        <Link to="/login" className="row gap center-row">
          <Icon name="arrowLeft" size={16} />
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}
