import { Icon } from '../ui/Icon';

export function ApprovalPreview() {
  return (
    <figure className="approval" aria-label="Example approval dialog">
      <div className="approval-bar" aria-hidden="true">
        <i />
        <i />
        <i />
        <span>MCP Command Approval</span>
      </div>
      <div className="approval-body">
        <h3>
          <Icon name="shieldCheck" />
          Approve running this command?
        </h3>
        <div className="approval-cmd">npm test -- --watch=false</div>
        <div className="approval-actions" aria-hidden="true">
          <span className="btn btn-ghost btn-sm">Reject</span>
          <span className="btn btn-primary btn-sm">Approve</span>
        </div>
      </div>
    </figure>
  );
}
