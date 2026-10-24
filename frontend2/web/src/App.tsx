import { useCallback, useEffect, useState } from 'react';
import { fetchOverview } from './api';
import { fmtTime } from './format';
import type { Overview, Verdict } from './types';
import { Containers } from './components/Containers';
import { Findings } from './components/Findings';
import { Kpis } from './components/Kpis';
import { LogExplorer } from './components/LogExplorer';
import { ReportPanel } from './components/ReportPanel';
import { SeverityIcon } from './components/Severity';
import { Timeline } from './components/Timeline';

const WINDOWS = [1, 6, 24, 72];
const REFRESH_MS = 30_000;

const VERDICT: Record<Verdict, string> = {
  ok: 'Tout va bien',
  attention: 'Des points sont à surveiller',
  urgent: 'Un problème demande ton attention',
};

function readPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage indisponible : la préférence ne sera simplement pas retenue */
  }
}

export default function App() {
  const [hours, setHours] = useState<number>(() => readPref('veilleur.hours', 24));
  const [theme, setTheme] = useState<'auto' | 'light' | 'dark'>(() => readPref('veilleur.theme', 'auto'));
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    writePref('veilleur.theme', theme);
  }, [theme]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchOverview(hours));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => {
    writePref('veilleur.hours', hours);
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [hours, load]);

  const refresh = () => {
    load();
    setRefreshKey((k) => k + 1);
  };

  const services = data ? [...new Set(data.containers.map((c) => c.service))] : [];
  const counts = data
    ? { urgent: data.findings.filter((f) => f.severity === 'urgent').length,
        attention: data.findings.filter((f) => f.severity === 'attention').length }
    : null;

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
            <path fill="var(--accent)" d="M12 2c.6 4.6 2.4 7.4 10 10-7.6 2.6-9.4 5.4-10 10-.6-4.6-2.4-7.4-10-10 7.6-2.6 9.4-5.4 10-10z" />
          </svg>
          <div>
            <h1>Veilleur</h1>
            <p className="muted small">Les logs de ton LLM, expliqués en français</p>
          </div>
        </div>
        <div className="controls">
          <div className="segmented" role="group" aria-label="Période">
            {WINDOWS.map((w) => (
              <button key={w} className={w === hours ? 'on' : ''} onClick={() => setHours(w)} aria-pressed={w === hours}>
                {w} h
              </button>
            ))}
          </div>
          <button className="btn btn-ghost" onClick={refresh} disabled={loading}>
            {loading ? 'Lecture…' : 'Actualiser'}
          </button>
          <button className="icon-btn" aria-label="Changer de thème" title={`Thème : ${theme}`}
            onClick={() => setTheme(theme === 'auto' ? 'dark' : theme === 'dark' ? 'light' : 'auto')}>
            {theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐'}
          </button>
        </div>
      </header>

      {error && (
        <div className="error-box page-error">
          {error}
          <div className="small">Vérifie que le backend (dossier backend/) et le veilleur tournent : <code>docker compose ps</code></div>
        </div>
      )}

      {data && counts && (
        <>
          <div className={`verdict verdict-${data.verdict}`}>
            <SeverityIcon severity={data.verdict} size={22} />
            <div>
              <div className="verdict-title">{VERDICT[data.verdict]}</div>
              <div className="small verdict-sub">
                {counts.urgent} urgent · {counts.attention} à surveiller · {hours} dernières heures · mis à jour à {fmtTime(data.generated_at)}
              </div>
            </div>
          </div>

          <Kpis stats={data.stats} />

          <div className="grid">
            <div className="col">
              <Findings findings={data.findings} />
              <Timeline buckets={data.stats.timeline} bucketMinutes={data.stats.bucket_minutes} />
              <Containers containers={data.containers} />
            </div>
            <div className="col">
              <ReportPanel hours={hours} />
            </div>
          </div>
        </>
      )}

      {!data && !error && <div className="loading muted">Lecture des logs Docker…</div>}

      {data && <LogExplorer hours={hours} services={services} refreshKey={refreshKey} />}
    </div>
  );
}
