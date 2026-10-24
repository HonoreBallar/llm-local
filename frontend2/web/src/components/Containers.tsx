import type { Container } from '../types';
import { fmtBytes } from '../format';

function status(c: Container): { cls: string; label: string } {
  if (c.state !== 'running') {
    return c.service === 'model-init' && c.exit_code === 0
      ? { cls: 'idle', label: 'terminé' }
      : { cls: 'down', label: c.state };
  }
  if (c.health === 'unhealthy') return { cls: 'down', label: 'ne répond plus' };
  if (c.health === 'starting') return { cls: 'warn', label: 'démarrage' };
  return { cls: 'up', label: c.health === 'healthy' ? 'en bonne santé' : 'en marche' };
}

export function Containers({ containers }: { containers: Container[] }) {
  return (
    <section className="card">
      <h2 className="card-title">Services surveillés</h2>
      <ul className="containers">
        {containers.map((c) => {
          const s = status(c);
          const pct = c.mem_usage && c.mem_limit ? Math.min(100, (100 * c.mem_usage) / c.mem_limit) : null;
          return (
            <li key={c.name} className="container">
              <div className="container-head">
                <span className={`dot ${s.cls}`} aria-hidden />
                <span className="container-name">{c.service}</span>
                <span className="muted small">{s.label}</span>
              </div>
              <div className="container-meta muted small">
                <span title={c.image}>{c.project}</span>
                {c.restarts > 0 && <span className="warn-text">{c.restarts} redémarrage(s)</span>}
                {c.mem_usage != null && <span>{fmtBytes(c.mem_usage)}{c.mem_limit ? ` / ${fmtBytes(c.mem_limit)}` : ''}</span>}
              </div>
              {pct != null && (
                <div className="meter" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}
                  aria-label={`Mémoire de ${c.service}`}>
                  <span style={{ width: `${pct}%` }} className={pct > 85 ? 'hot' : ''} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
