import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchReport, fetchReports, streamReport } from '../api';
import { fmtDateTime, fmtDuration, fmtNum } from '../format';
import type { Fidelity, Perf, ReportSummary } from '../types';

type Phase = 'idle' | 'reading' | 'writing' | 'done' | 'error';

function Check({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className={`check ${ok ? 'pass' : 'fail'}`}>
      <span className="check-mark" aria-hidden>{ok ? '✓' : '✗'}</span>
      <span>
        <strong>{label}</strong> <span className="muted">{detail}</span>
      </span>
    </li>
  );
}

function Quality({ fidelity, perf }: { fidelity: Fidelity; perf: Perf }) {
  const invented = fidelity.numbers_invented;
  return (
    <div className="quality">
      <h3 className="quality-title">Test du LLM sur ce rapport</h3>
      <ul className="checks">
        <Check ok={invented.length === 0} label="Chiffres fidèles"
          detail={invented.length
            ? `${invented.length} chiffre(s) absent(s) des données : ${invented.join(', ')}`
            : `${fidelity.numbers_total} chiffre(s) cité(s), tous présents dans les données`} />
        <Check ok={fidelity.verdict_ok} label="Gravité respectée"
          detail={`attendu ${fidelity.verdict_expected}, utilisé ${fidelity.verdict_used ?? 'aucun'}`} />
        <Check ok={fidelity.length_ok} label="Longueur" detail={`${fidelity.words} mots (consigne : 150 max)`} />
      </ul>
      <div className="perf muted small">
        Premier mot après {fmtDuration(perf.first_token_s)} · total {fmtDuration(perf.total_s)}
        {perf.tokens_per_s != null && <> · {fmtNum(perf.tokens_per_s)} tokens/s</>}
      </div>
    </div>
  );
}

export function ReportPanel({ hours }: { hours: number }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [text, setText] = useState('');
  const [facts, setFacts] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ fidelity: Fidelity; perf: Perf } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [history, setHistory] = useState<ReportSummary[]>([]);
  const [current, setCurrent] = useState<{ id: string; created_at: string; window_hours: number } | null>(null);
  const abort = useRef<AbortController | null>(null);

  const loadHistory = () => fetchReports().then(setHistory).catch(() => {});

  useEffect(() => {
    loadHistory();
    return () => abort.current?.abort();
  }, []);

  useEffect(() => {
    if (phase !== 'reading' && phase !== 'writing') return;
    const start = Date.now();
    const t = setInterval(() => setElapsed((Date.now() - start) / 1000), 500);
    return () => clearInterval(t);
  }, [phase]);

  async function generate() {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setText('');
    setFacts('');
    setError('');
    setResult(null);
    setCurrent(null);
    setElapsed(0);
    setPhase('reading');
    try {
      await streamReport(hours, (e) => {
        if (e.type === 'meta') setFacts(e.facts);
        else if (e.type === 'delta') {
          setPhase('writing');
          setText((t) => t + e.text);
        } else if (e.type === 'done') {
          setResult({ fidelity: e.fidelity, perf: e.perf });
          setCurrent({ id: e.id, created_at: new Date().toISOString(), window_hours: hours });
          setPhase('done');
          loadHistory();
        } else if (e.type === 'error') {
          setError(e.message);
          setPhase('error');
        }
      }, ctrl.signal);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setError((err as Error).message);
      setPhase('error');
    }
  }

  async function open(id: string) {
    if (!id) return;
    abort.current?.abort();
    try {
      const r = await fetchReport(id);
      setText(r.text);
      setFacts(r.facts);
      setResult({ fidelity: r.fidelity, perf: r.perf });
      setCurrent({ id: r.id, created_at: r.created_at, window_hours: r.window_hours });
      setError('');
      setPhase('done');
    } catch (err) {
      setError((err as Error).message);
      setPhase('error');
    }
  }

  const busy = phase === 'reading' || phase === 'writing';

  return (
    <section className="card report">
      <div className="card-head">
        <h2 className="card-title">Rapport du veilleur</h2>
        {history.length > 0 && (
          <select className="select small" value={current?.id ?? ''} onChange={(e) => open(e.target.value)}
            aria-label="Rapports précédents">
            <option value="">Historique ({history.length})</option>
            {history.map((h) => (
              <option key={h.id} value={h.id}>
                {fmtDateTime(h.created_at)} · {h.window_hours} h{h.fidelity.numbers_invented.length ? ' · ⚠' : ''}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="muted small">
        Ton LLM local lit les chiffres et les constats ci-contre, puis les explique en français.
      </p>

      <button className="btn btn-primary btn-wide" onClick={busy ? () => { abort.current?.abort(); setPhase('idle'); } : generate}>
        {busy ? 'Arrêter' : phase === 'done' ? 'Générer un nouveau rapport' : `Générer le rapport (${hours} h)`}
      </button>

      {phase === 'reading' && (
        <div className="progress">
          <span className="spinner" aria-hidden />
          Le modèle lit les données… {Math.round(elapsed)} s
          <div className="muted small">Sur CPU, la lecture prend souvent 20 à 60 s avant le premier mot.</div>
        </div>
      )}

      {(text || phase === 'writing') && (
        <div className="report-text">
          {current && <div className="muted small report-date">{fmtDateTime(current.created_at)} · {current.window_hours} dernières heures</div>}
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          {phase === 'writing' && <span className="caret" aria-hidden />}
        </div>
      )}

      {phase === 'error' && <div className="error-box">Le rapport n'a pas pu être généré : {error}</div>}

      {result && <Quality fidelity={result.fidelity} perf={result.perf} />}

      {facts && (
        <details className="facts">
          <summary className="small">Données envoyées au modèle</summary>
          <pre>{facts}</pre>
        </details>
      )}
    </section>
  );
}
