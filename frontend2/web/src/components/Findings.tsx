import { useState } from 'react';
import type { Finding } from '../types';
import { SeverityBadge } from './Severity';

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const isCommand = !/^[A-ZÀ-Ü]/.test(command); // « Augmenter … » est un conseil, pas une commande
  if (!isCommand) return <p className="advice">👉 {command}</p>;
  return (
    <div className="command">
      <code>{command}</code>
      <button
        className="link-btn small"
        onClick={() => {
          navigator.clipboard?.writeText(command.split('   #')[0]);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? 'Copié' : 'Copier'}
      </button>
    </div>
  );
}

export function Findings({ findings }: { findings: Finding[] }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Constats</h2>
        <span className="muted small">calculés par des règles, sans IA</span>
      </div>
      <ul className="findings">
        {findings.map((f, i) => (
          <li key={i} className={`finding sev-border-${f.severity}`}>
            <div className="finding-head">
              <SeverityBadge severity={f.severity} />
              <span className="finding-title">{f.title}</span>
            </div>
            {f.detail && <p className="finding-detail">{f.detail}</p>}
            {f.command && <CopyCommand command={f.command} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
