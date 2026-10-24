import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { fichesApi } from '../api';
import AnalyseBadge from '../components/AnalyseBadge';
import AnalysePanel from '../components/AnalysePanel';
import ConfirmDialog from '../components/ConfirmDialog';
import DocumentsSection from '../components/DocumentsSection';
import { navigate } from '../router';
import type { Donnees, Fiche, FicheType, FieldDef } from '../types';
import { useFicheTypes } from '../useFicheTypes';

const POLL_MS = 4000;

function Field({
  def,
  value,
  disabled,
  onChange,
}: {
  def: FieldDef;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const common = { id: `f-${def.key}`, className: 'input', value, disabled, required: def.required };
  let control;
  if (def.type === 'select')
    control = (
      <select {...common} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {def.options!.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    );
  else if (def.type === 'textarea')
    control = <textarea {...common} rows={2} maxLength={500} onChange={(e) => onChange(e.target.value)} />;
  else
    control = (
      <input {...common} type={def.type} maxLength={150} onChange={(e) => onChange(e.target.value)} />
    );
  return (
    <label className={`field${def.type === 'textarea' ? ' full' : ''}`} htmlFor={common.id}>
      <span>
        {def.label} {def.required && <span className="req">*</span>}
      </span>
      {control}
    </label>
  );
}

export default function FicheDetail({
  id,
  newType,
  version,
}: {
  id?: number;
  newType?: FicheType;
  version: number;
}) {
  const types = useFicheTypes();
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [values, setValues] = useState<Donnees>({});
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const type = fiche?.type ?? newType;
  const def = type && types ? types[type] : null;

  const reload = useCallback(
    async (resetForm = false) => {
      if (!id) return;
      try {
        const f = await fichesApi.get(id);
        setFiche(f);
        if (resetForm) {
          setValues(f.donnees);
          setDirty(false);
        }
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    reload(!dirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, version]);

  const running = fiche?.analyse?.statut === 'en_cours';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => reload(), POLL_MS);
    return () => clearInterval(t);
  }, [running, reload]);

  function set(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
    setDirty(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!type) return;
    setSaving(true);
    setError(null);
    try {
      if (fiche) {
        const f = await fichesApi.update(fiche.id, values);
        setFiche(f);
        setValues(f.donnees);
        setDirty(false);
      } else {
        const f = await fichesApi.create(type, values);
        navigate(`/fiches/${f.id}`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function analyse() {
    if (!fiche) return;
    setStarting(true);
    setError(null);
    try {
      setFiche(await fichesApi.analyse(fiche.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStarting(false);
    }
  }

  async function confirmDelete() {
    if (!fiche) return;
    await fichesApi.remove(fiche.id);
    navigate('/fiches');
  }

  if (loading || !types) return <p className="empty">Chargement…</p>;
  if (!def)
    return (
      <>
        <a href="#/fiches" className="back">← Fiches</a>
        <div className="alert">{error ?? 'Fiche introuvable.'}</div>
      </>
    );

  const name = [fiche?.donnees.nom, fiche?.donnees.prenoms].filter(Boolean).join(' ');
  const missingDocs = def.documents
    .filter((d) => d.required && !fiche?.documents?.some((doc) => doc.role === d.role))
    .map((d) => d.label);
  let missing: string | null = null;
  if (dirty) missing = "Enregistrez d'abord les modifications de la fiche.";
  else if (missingDocs.length) missing = `Ajoutez d'abord : ${missingDocs.join(', ')}.`;

  return (
    <>
      <a href="#/fiches" className="back">← Fiches</a>
      <header className="page-header">
        <div>
          <div className="title-line">
            <span className={`type-tag type-${def.type}`}>{def.label}</span>
            {fiche && <AnalyseBadge analyse={fiche.analyse} />}
          </div>
          <h1>{fiche ? name : `Nouvelle fiche ${def.label}`}</h1>
          <p className="subtitle">{def.description}</p>
        </div>
        {fiche && (
          <button className="btn btn-ghost danger" onClick={() => setDeleting(true)}>
            Supprimer la fiche
          </button>
        )}
      </header>

      {error && <div className="alert">{error}</div>}

      <div className={fiche ? 'detail-grid' : ''}>
        <form className="card panel" onSubmit={save}>
          <div className="panel-head">
            <h2>Informations</h2>
          </div>
          {running && <p className="muted small">Analyse en cours : la fiche est verrouillée.</p>}
          <div className="fields">
            {def.fields.map((f) => (
              <Field
                key={f.key}
                def={f}
                value={values[f.key] ?? ''}
                disabled={running}
                onChange={(v) => set(f.key, v)}
              />
            ))}
          </div>
          <div className="form-actions">
            {fiche && dirty && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setValues(fiche.donnees);
                  setDirty(false);
                }}
              >
                Annuler
              </button>
            )}
            {!fiche && (
              <a href="#/fiches" className="btn">
                Annuler
              </a>
            )}
            <button className="btn btn-primary" disabled={saving || running || (fiche !== null && !dirty)}>
              {saving ? 'Enregistrement…' : fiche ? 'Enregistrer' : 'Créer la fiche'}
            </button>
          </div>
          {fiche && dirty && fiche.analyse && (
            <p className="muted small">L'enregistrement effacera le résultat de l'analyse.</p>
          )}
          {!fiche && <p className="muted small">Les documents s'ajoutent une fois la fiche créée.</p>}
        </form>

        {fiche && (
          <div className="side">
            <DocumentsSection
              ficheId={fiche.id}
              defs={def.documents}
              documents={fiche.documents ?? []}
              locked={running}
              onChanged={() => reload()}
            />
            <AnalysePanel
              analyse={fiche.analyse}
              canAnalyse={!missing}
              missing={missing}
              busy={starting}
              onAnalyse={analyse}
            />
          </div>
        )}
      </div>

      {deleting && fiche && (
        <ConfirmDialog
          message={`Supprimer la fiche ${def.label} de « ${name} » et ses documents ?`}
          onConfirm={confirmDelete}
          onClose={() => setDeleting(false)}
        />
      )}
    </>
  );
}
