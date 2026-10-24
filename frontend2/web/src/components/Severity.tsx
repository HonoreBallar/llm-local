import type { Severity } from '../types';

const LABEL: Record<Severity, string> = {
  urgent: 'Urgent',
  attention: 'À surveiller',
  info: 'Info',
  ok: 'OK',
};

/** Icône + texte : la gravité ne repose jamais sur la couleur seule. */
export function SeverityIcon({ severity, size = 16 }: { severity: Severity; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true } as const;
  switch (severity) {
    case 'urgent':
      return (
        <svg {...common}>
          <path d="M8 1.5 15 14H1z" fill="currentColor" />
          <path d="M8 6v3.5M8 11.6v.1" stroke="var(--surface)" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'attention':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.5" fill="currentColor" />
          <path d="M8 4.5V8.5M8 11v.1" stroke="var(--surface)" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'ok':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.5" fill="currentColor" />
          <path d="m5 8.2 2 2 4-4.2" fill="none" stroke="var(--surface)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.5" fill="currentColor" />
          <path d="M8 7.2V11M8 4.9v.1" stroke="var(--surface)" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
  }
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`badge sev-${severity}`}>
      <SeverityIcon severity={severity} size={13} />
      {LABEL[severity]}
    </span>
  );
}
