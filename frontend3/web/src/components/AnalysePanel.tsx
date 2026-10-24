import { useEffect, useState } from 'react';
import type { Analyse, ChampCompare } from '../types';
import { VERDICT_LABELS } from './AnalyseBadge';

const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

const VERDICT_HINTS = {
  conforme: 'Le document correspond au type attendu et aux informations de la fiche.',
  a_verifier: 'Le document semble être le bon, mais des points demandent un contrôle humain.',
  non_conforme: "Le document joint n'est pas le document attendu.",
};

const STATUT_ICON: Record<ChampCompare['statut'], { icon: string; label: string }> = {
  ok: { icon: '✓', label: 'Concorde' },
  ecart: { icon: '✕', label: 'Écart' },
  non_lu: { icon: '—', label: 'Non lu sur le document' },
};

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.round((now - Date.parse(since)) / 1000));
  return <>{s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`}</>;
}

export default function AnalysePanel({
  analyse,
  canAnalyse,
  missing,
  busy,
  onAnalyse,
}: {
  analyse: Analyse | null;
  canAnalyse: boolean;
  missing: string | null;
  busy: boolean;
  onAnalyse: () => void;
}) {
  const running = analyse?.statut === 'en_cours';
  const button = (
    <button className="btn btn-primary" onClick={onAnalyse} disabled={!canAnalyse || running || busy}>
      {analyse && analyse.statut !== 'en_cours' ? "Relancer l'analyse" : 'Analyser'}
    </button>
  );

  return (
    <section className="card panel">
      <div className="panel-head">
        <h2>Analyse du document</h2>
        {!running && button}
      </div>

      {missing && <p className="muted small">{missing}</p>}

      {!analyse && !missing && (
        <p className="muted small">
          Le LLM local vérifie que le document joint est bien le document attendu et compare ce
          qu'il lit avec la fiche.
        </p>
      )}

      {running && (
        <div className="analyse-running">
          <span className="spinner lg" aria-hidden="true" />
          <div>
            <strong>Analyse en cours…</strong>
            <p className="muted small">
              <Elapsed since={analyse.lance_le} /> écoulées. Sur CPU, compter 2 à 5 minutes. Vous
              pouvez quitter la page, le résultat sera enregistré sur la fiche.
            </p>
          </div>
        </div>
      )}

      {analyse?.statut === 'erreur' && <div className="alert">{analyse.message}</div>}

      {analyse?.statut === 'termine' && (
        <>
          <div className={`verdict verdict-${analyse.verdict}`}>
            <strong>{VERDICT_LABELS[analyse.verdict]}</strong>
            <span>{VERDICT_HINTS[analyse.verdict]}</span>
          </div>

          <dl className="facts">
            <dt>Document détecté</dt>
            <dd>{analyse.type_detecte}</dd>
            <dt>Confiance du modèle</dt>
            <dd>
              <span className="meter" aria-hidden="true">
                <span style={{ width: `${analyse.confiance}%` }} />
              </span>
              {analyse.confiance} %
            </dd>
          </dl>

          {analyse.alertes.length > 0 && (
            <ul className="alert-list">
              {analyse.alertes.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}

          {analyse.champs.length > 0 && (
            <table className="table compare">
              <thead>
                <tr>
                  <th>Champ</th>
                  <th>Fiche</th>
                  <th>Lu sur le document</th>
                  <th aria-label="Résultat" />
                </tr>
              </thead>
              <tbody>
                {analyse.champs.map((c) => (
                  <tr key={c.key} className={`row-${c.statut}`}>
                    <td>{c.label}</td>
                    <td>{c.fiche ?? <span className="muted">—</span>}</td>
                    <td>{c.lu ?? <span className="muted">non lu</span>}</td>
                    <td className="cmp-icon" title={STATUT_ICON[c.statut].label}>
                      {STATUT_ICON[c.statut].icon}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {analyse.raisons.length > 0 && (
            <details className="raisons">
              <summary>Raisons données par le modèle</summary>
              <ul>
                {analyse.raisons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </details>
          )}

          <p className="muted small">
            Analysé le {dateTime.format(new Date(analyse.termine_le))} en {analyse.duree_s} s (
            {analyse.documents.join(', ')}). Aide à la vérification par une IA locale : elle peut se
            tromper et ne remplace pas un contrôle humain.
          </p>
        </>
      )}
    </section>
  );
}
