import { useEffect, useState } from 'react';
import { fetchLogs } from '../api';
import { fmtLogTs } from '../format';
import type { LogEvent } from '../types';

const LEVELS = [
  { value: '', label: 'Tous niveaux' },
  { value: 'warn', label: 'Avertissements et erreurs' },
  { value: 'error', label: 'Erreurs seulement' },
];

export function LogExplorer({ hours, services, refreshKey }: { hours: number; services: string[]; refreshKey: number }) {
  const [service, setService] = useState('');
  const [level, setLevel] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [noise, setNoise] = useState(false);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchLogs({ hours, service, level, q: query, noise })
      .then((r) => {
        if (!alive) return;
        setEvents(r.events);
        setTotal(r.total_lines);
        setError('');
      })
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [hours, service, level, query, noise, refreshKey]);

  return (
    <section className="card logs">
      <div className="card-head">
        <h2 className="card-title">Logs</h2>
        <span className="muted small">
          {loading ? 'Chargement…' : `${events.length} affichée(s) sur ${total} ligne(s)${events.length >= 400 ? ' (400 plus récentes)' : ''}`}
        </span>
      </div>
      <div className="filters">
        <select className="select" value={service} onChange={(e) => setService(e.target.value)} aria-label="Service">
          <option value="">Tous les services</option>
          {services.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="select" value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Niveau">
          {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        <input className="input" type="search" placeholder="Rechercher (ex. /v1/messages, error…)" value={q}
          onChange={(e) => setQ(e.target.value)} />
        <label className="toggle small">
          <input type="checkbox" checked={noise} onChange={(e) => setNoise(e.target.checked)} />
          Afficher le bruit (sondes de santé, progression)
        </label>
      </div>
      {error && <div className="error-box">{error}</div>}
      <div className="log-list" role="log">
        {events.map((e, i) => (
          <div key={i} className={`log-line lvl-${e.level}${e.noise ? ' noise' : ''}`}>
            <span className="log-ts">{fmtLogTs(e.ts)}</span>
            <span className="log-svc">{e.service}</span>
            <span className="log-lvl">{e.level === 'error' ? 'ERR' : e.level === 'warn' ? 'WARN' : ''}</span>
            <span className="log-text">{e.text}</span>
          </div>
        ))}
        {!loading && !events.length && !error && <div className="muted empty">Aucune ligne ne correspond aux filtres.</div>}
      </div>
    </section>
  );
}
