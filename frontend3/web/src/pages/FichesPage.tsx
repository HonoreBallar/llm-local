import { useCallback, useEffect, useState } from 'react';
import { fichesApi } from '../api';
import { navigate } from '../router';
import AnalyseBadge from '../components/AnalyseBadge';
import ConfirmDialog from '../components/ConfirmDialog';
import type { Fiche, FicheType } from '../types';
import { useFicheTypes } from '../useFicheTypes';

const POLL_MS = 4000;
const fullName = (f: Fiche) => [f.donnees.nom, f.donnees.prenoms].filter(Boolean).join(' ');

export default function FichesPage({ version }: { version: number }) {
  const types = useFicheTypes();
  const [fiches, setFiches] = useState<Fiche[]>([]);
  const [type, setType] = useState<FicheType | undefined>();
  const [search, setSearch] = useState('');
  const [expirees, setExpirees] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Fiche | null>(null);

  const reload = useCallback(async () => {
    try {
      setFiches(await fichesApi.list({ type, q: search, expirees }));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [type, search, expirees]);

  useEffect(() => {
    const t = setTimeout(reload, 250);
    return () => clearTimeout(t);
  }, [reload, version]);

  // Tant qu'une analyse tourne, on rafraîchit la liste pour voir le résultat arriver.
  const analysing = fiches.some((f) => f.analyse?.statut === 'en_cours');
  useEffect(() => {
    if (!analysing) return;
    const t = setInterval(reload, POLL_MS);
    return () => clearInterval(t);
  }, [analysing, reload]);

  async function confirmDelete() {
    if (!deleting) return;
    await fichesApi.remove(deleting.id);
    setDeleting(null);
    await reload();
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Fiches clients</h1>
          <p className="subtitle">
            Fiches CNI et KYC, avec analyse des documents par le LLM local.
          </p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => navigate('/fiches/nouvelle/cni')}>
            + Fiche CNI
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/fiches/nouvelle/kyc')}>
            + Fiche KYC
          </button>
        </div>
      </header>

      <div className="toolbar wrap">
        <div className="segmented" role="tablist" aria-label="Type de fiche">
          {([undefined, 'cni', 'kyc'] as const).map((t) => (
            <button
              key={t ?? 'all'}
              role="tab"
              aria-selected={type === t}
              className={type === t ? 'active' : ''}
              onClick={() => {
                setType(t);
                if (t === 'kyc') setExpirees(false);
              }}
            >
              {t ? t.toUpperCase() : 'Toutes'}
            </button>
          ))}
        </div>
        <input
          className="input search"
          type="search"
          placeholder="Nom, numéro, téléphone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {type !== 'kyc' && (
          <label className="check">
            <input type="checkbox" checked={expirees} onChange={(e) => setExpirees(e.target.checked)} />
            CNI expirées
          </label>
        )}
        <span className="count">
          {fiches.length} fiche{fiches.length > 1 ? 's' : ''}
        </span>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="card">
        {loading ? (
          <p className="empty">Chargement…</p>
        ) : fiches.length === 0 ? (
          <p className="empty">
            {search || type || expirees ? 'Aucun résultat.' : 'Aucune fiche pour le moment.'}
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Nom et prénoms</th>
                <th className="col-date">Référence</th>
                <th className="col-date">Documents</th>
                <th>Analyse</th>
                <th className="col-actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {fiches.map((f) => (
                <tr key={f.id} className="clickable" onClick={() => navigate(`/fiches/${f.id}`)}>
                  <td>
                    <span className={`type-tag type-${f.type}`}>{f.type.toUpperCase()}</span>
                  </td>
                  <td className="cell-name">{fullName(f)}</td>
                  <td className="col-date muted">
                    {(types && f.donnees[types[f.type].reference]) || '—'}
                  </td>
                  <td className="col-date muted">{f.nb_documents ?? 0}</td>
                  <td>
                    <AnalyseBadge analyse={f.analyse} />
                  </td>
                  <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-ghost" onClick={() => navigate(`/fiches/${f.id}`)}>
                      Ouvrir
                    </button>
                    <button className="btn btn-ghost danger" onClick={() => setDeleting(f)}>
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {deleting && (
        <ConfirmDialog
          message={`Supprimer la fiche ${deleting.type.toUpperCase()} de « ${fullName(deleting)} » et ses documents ?`}
          onConfirm={confirmDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
