import { Icon, type IconName } from '../ui/Icon';

export function AccountProp({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <li>
      <span className="prop-label">
        <Icon name={icon} size={16} />
        {label}
      </span>
      <span className="prop-value">{value}</span>
    </li>
  );
}
