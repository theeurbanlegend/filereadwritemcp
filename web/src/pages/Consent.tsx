import { useSearchParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { AuthCard } from '../components/auth/AuthCard';
import { ConsentParties } from '../components/consent/ConsentParties';
import { ScopeList } from '../components/consent/ScopeList';
import { Alert } from '../components/ui/Alert';
import { Icon } from '../components/ui/Icon';
import { useAuthorizeClient } from '../hooks/mutations/oauth';
import { useSession } from '../hooks/queries/auth';
import { useOauthClient } from '../hooks/queries/oauth';
import { redirectTarget } from '../lib/navigation';

const FIELDS = [
  'client_id',
  'redirect_uri',
  'scope',
  'state',
  'code_challenge',
  'code_challenge_method',
  'response_type',
] as const;

export default function Consent() {
  const [params] = useSearchParams();
  const { me } = useSession();
  const clientId = params.get('client_id');

  const client = useOauthClient(clientId);
  const authorize = useAuthorizeClient();

  function decide(approve: boolean) {
    const body: Record<string, string | boolean> = { approve };
    for (const f of FIELDS) {
      const v = params.get(f);
      if (v !== null) body[f] = v;
    }
    authorize.mutate(body);
  }

  if (!clientId) {
    return (
      <AuthCard icon="alert" title="Invalid request">
        <Alert>This authorization link is missing its client. Start again from your MCP client.</Alert>
      </AuthCard>
    );
  }

  const name = client.data?.clientName || 'An MCP client';
  const destination = redirectTarget(params.get('redirect_uri'));

  return (
    <AuthCard
      eyebrow="Authorization"
      title="Authorize access"
      top={<ConsentParties clientName={client.data?.clientName ?? null} />}
      subtitle={
        <>
          <strong>{client.isPending ? 'An MCP client' : name}</strong> wants to access your machines through
          FileReadWrite.
        </>
      }
    >
      {client.error && <Alert>{errorMessage(client.error)}</Alert>}
      {authorize.error && <Alert>{errorMessage(authorize.error)}</Alert>}
      <div className="principal">
        <span className="avatar" aria-hidden="true">
          {me?.email.charAt(0)}
        </span>
        <div>
          <span className="eyebrow">Signed in as</span>
          <strong>{me?.email}</strong>
        </div>
      </div>
      <ScopeList />
      {destination && (
        <p className="muted small">
          Approving sends you back to <strong>{destination}</strong>. Only continue if that's the app you were using.
        </p>
      )}
      <p className="muted small">You can revoke access anytime from your dashboard.</p>
      <div className="consent-actions">
        <button className="btn btn-secondary btn-lg" disabled={authorize.isPending} onClick={() => decide(false)}>
          <Icon name="x" size={16} />
          Deny
        </button>
        <button
          className="btn btn-primary btn-lg"
          disabled={authorize.isPending || !!client.error}
          onClick={() => decide(true)}
        >
          <Icon name="lock" size={16} />
          Approve
        </button>
      </div>
    </AuthCard>
  );
}
