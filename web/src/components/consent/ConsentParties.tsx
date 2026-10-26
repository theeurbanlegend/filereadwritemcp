import { Icon } from '../ui/Icon';

export function ConsentParties({ clientName }: { clientName: string | null }) {
  return (
    <div className="consent-parties" aria-hidden="true">
      <div className="party">
        <span className="row-icon">{clientName ? clientName.charAt(0).toUpperCase() : '?'}</span>
        {clientName || 'MCP client'}
      </div>
      <span className="party-link">
        <Icon name="swap" size={22} />
      </span>
      <div className="party">
        <span className="row-icon">
          <Icon name="code" size={22} />
        </span>
        Your machines
      </div>
    </div>
  );
}
