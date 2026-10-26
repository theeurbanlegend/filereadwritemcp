import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../api/client';
import { useDeleteAccount } from '../../hooks/mutations/account';
import { Alert } from '../ui/Alert';
import { Icon } from '../ui/Icon';

export function DeleteAccount({ email }: { email: string }) {
  const [confirmEmail, setConfirmEmail] = useState('');
  const remove = useDeleteAccount();
  const matches = confirmEmail.trim().toLowerCase() === email.toLowerCase();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (matches) remove.mutate(confirmEmail);
  }

  return (
    <section className="card danger">
      <div className="card-head">
        <div className="card-title">
          <span className="danger-icon">
            <Icon name="alert" size={20} />
          </span>
          <h2>Delete account</h2>
        </div>
      </div>
      <p className="muted">
        Permanently deletes your account, revokes every machine and MCP client, and removes all your data. This can't
        be undone.
      </p>
      {remove.error && <Alert>{errorMessage(remove.error)}</Alert>}
      <form onSubmit={submit} className="form">
        <label>
          Type <strong>{email}</strong> to confirm
          <input placeholder={email} value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} autoComplete="off" />
        </label>
        <button className="btn btn-danger btn-block" disabled={remove.isPending || !matches}>
          Delete my account
        </button>
      </form>
    </section>
  );
}
