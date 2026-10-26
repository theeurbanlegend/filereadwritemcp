import { useState } from 'react';
import { Icon } from './Icon';

interface Props {
  value: string;
  label?: string;
  variant?: 'button' | 'inline';
}

export function CopyButton({ value, label = 'Copy', variant = 'button' }: Props) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      type="button"
      className={variant === 'inline' ? 'copy-inline' : 'btn btn-secondary btn-sm'}
      onClick={copy}
      aria-live="polite"
    >
      <Icon name={copied ? 'check' : 'copy'} size={variant === 'inline' ? 14 : 16} />
      {copied ? 'Copied' : label}
    </button>
  );
}
