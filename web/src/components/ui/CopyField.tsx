import { CopyButton } from './CopyButton';
import { Icon, type IconName } from './Icon';

interface Props {
  value: string;
  label?: string;
  icon?: IconName;
  className?: string;
}

export function CopyField({ value, label, icon, className = 'code-row' }: Props) {
  return (
    <div className={className}>
      {icon && <Icon name={icon} />}
      <code>{value}</code>
      <CopyButton value={value} label={label} />
    </div>
  );
}
