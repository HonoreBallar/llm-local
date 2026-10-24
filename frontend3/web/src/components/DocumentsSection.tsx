import { useRef, useState, type DragEvent } from 'react';
import { fichesApi } from '../api';
import type { DocDef, FicheDocument } from '../types';

const ACCEPT = 'image/jpeg,image/png,application/pdf';
const MAX_SIZE = 10 * 1024 * 1024;

const size = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} Mo` : `${Math.ceil(n / 1024)} Ko`);

function DocSlot({
  ficheId,
  def,
  docs,
  locked,
  onChanged,
}: {
  ficheId: number;
  def: DocDef;
  docs: FicheDocument[];
  locked: boolean;
  onChanged: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  async function upload(files: FileList | null) {
    const list = Array.from(files ?? []).slice(0, def.multiple ? 5 : 1);
    if (!list.length) return;
    setError(null);
    setBusy(true);
    try {
      for (const file of list) {
        if (file.size > MAX_SIZE) throw new Error(`« ${file.name} » dépasse 10 Mo.`);
        await fichesApi.upload(ficheId, def.role, file);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
      onChanged();
    }
  }

  async function remove(doc: FicheDocument) {
    setError(null);
    try {
      await fichesApi.removeDocument(ficheId, doc.id);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    if (!locked) upload(e.dataTransfer.files);
  }

  const canAdd = !locked && (def.multiple || docs.length === 0);

  return (
    <div className="doc-slot">
      <div className="doc-slot-head">
        <span>
          {def.label} {def.required && <span className="req">*</span>}
        </span>
        {!def.multiple && docs.length > 0 && !locked && (
          <button className="btn btn-ghost btn-sm" onClick={() => input.current?.click()}>
            Remplacer
          </button>
        )}
      </div>

      <div className="doc-list">
        {docs.map((d) => {
          const url = fichesApi.documentUrl(ficheId, d.id);
          return (
            <figure key={d.id} className="doc">
              <a href={url} target="_blank" rel="noreferrer" className="doc-thumb" title="Ouvrir">
                {d.mime === 'application/pdf' ? (
                  <span className="pdf">PDF</span>
                ) : (
                  <img src={url} alt={d.nom_fichier} loading="lazy" />
                )}
              </a>
              <figcaption>
                <span className="doc-name" title={d.nom_fichier}>
                  {d.nom_fichier}
                </span>
                <span className="muted">{size(d.taille)}</span>
                {!locked && (
                  <button className="link danger" onClick={() => remove(d)}>
                    Retirer
                  </button>
                )}
              </figcaption>
            </figure>
          );
        })}

        {canAdd && (
          <button
            className={`dropzone${over ? ' over' : ''}`}
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
            disabled={busy}
          >
            {busy ? (
              <span className="spinner" aria-hidden="true" />
            ) : (
              <>
                <strong>Ajouter</strong>
                <span className="muted">JPG, PNG ou PDF · 10 Mo max</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple={def.multiple}
        hidden
        onChange={(e) => upload(e.target.files)}
      />
      {error && <div className="alert small">{error}</div>}
    </div>
  );
}

export default function DocumentsSection({
  ficheId,
  defs,
  documents,
  locked,
  onChanged,
}: {
  ficheId: number;
  defs: DocDef[];
  documents: FicheDocument[];
  locked: boolean;
  onChanged: () => void;
}) {
  return (
    <section className="card panel">
      <div className="panel-head">
        <h2>Documents</h2>
      </div>
      {locked && <p className="muted small">Analyse en cours : les documents sont verrouillés.</p>}
      {defs.map((def) => (
        <DocSlot
          key={def.role}
          ficheId={ficheId}
          def={def}
          docs={documents.filter((d) => d.role === def.role)}
          locked={locked}
          onChanged={onChanged}
        />
      ))}
    </section>
  );
}
