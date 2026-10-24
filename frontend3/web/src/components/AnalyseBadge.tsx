import type { Analyse, Verdict } from '../types';

export const VERDICT_LABELS: Record<Verdict, string> = {
  conforme: 'Conforme',
  a_verifier: 'À vérifier',
  non_conforme: 'Non conforme',
};

export default function AnalyseBadge({ analyse }: { analyse: Analyse | null }) {
  if (!analyse) return <span className="badge badge-neutral">Non analysée</span>;
  if (analyse.statut === 'en_cours')
    return (
      <span className="badge badge-info">
        <span className="spinner" aria-hidden="true" /> En cours
      </span>
    );
  if (analyse.statut === 'erreur') return <span className="badge badge-danger">Échec</span>;
  return <span className={`badge badge-${analyse.verdict}`}>{VERDICT_LABELS[analyse.verdict]}</span>;
}
