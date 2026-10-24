import { useState, type FormEvent } from 'react';
import type { Category, CategoryInput } from '../types';
import Modal from './Modal';

export default function CategoryForm({
  initial,
  onSubmit,
  onClose,
}: {
  initial: Category | null;
  onSubmit: (input: CategoryInput) => Promise<void>;
  onClose: () => void;
}) {
  const [nom, setNom] = useState(initial?.nom ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!nom.trim()) return setError('Le nom est obligatoire.');
    setSaving(true);
    try {
      await onSubmit({ nom: nom.trim(), description: description.trim() });
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? 'Modifier la catégorie' : 'Nouvelle catégorie'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <label>
          Nom
          <input
            className="input"
            value={nom}
            maxLength={100}
            autoFocus
            onChange={(e) => setNom(e.target.value)}
          />
        </label>
        <label>
          Description <span className="muted">(optionnelle)</span>
          <textarea
            className="input"
            rows={3}
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        {error && <div className="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
