import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import CategoryForm from '../components/CategoryForm';
import ConfirmDialog from '../components/ConfirmDialog';
import type { Category, CategoryInput } from '../types';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

export default function CategoriesPage({ version }: { version: number }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // null = fermé, 'new' = création, Category = édition
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const reload = useCallback(async () => {
    try {
      setCategories(await api.list(search));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(reload, 250);
    return () => clearTimeout(t);
  }, [reload, version]);

  async function save(input: CategoryInput) {
    if (editing === 'new') await api.create(input);
    else if (editing) await api.update(editing.id, input);
    setEditing(null);
    await reload();
  }

  async function confirmDelete() {
    if (!deleting) return;
    await api.remove(deleting.id);
    setDeleting(null);
    await reload();
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Catégories</h1>
          <p className="subtitle">
            Gérez vos catégories ici, ou demandez à l'assistant en bas à droite.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          + Nouvelle catégorie
        </button>
      </header>

      <div className="toolbar">
        <input
          className="input search"
          type="search"
          placeholder="Rechercher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="count">
          {categories.length} catégorie{categories.length > 1 ? 's' : ''}
        </span>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="card">
        {loading ? (
          <p className="empty">Chargement…</p>
        ) : categories.length === 0 ? (
          <p className="empty">
            {search ? 'Aucun résultat.' : 'Aucune catégorie pour le moment.'}
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Description</th>
                <th className="col-date">Modifiée</th>
                <th className="col-actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td className="cell-name">{c.nom}</td>
                  <td className="cell-desc">{c.description || <span className="muted">—</span>}</td>
                  <td className="col-date muted" title={`Créée le ${dateFormat.format(new Date(c.created_at))}`}>
                    {dateFormat.format(new Date(c.updated_at))}
                  </td>
                  <td className="col-actions">
                    <button className="btn btn-ghost" onClick={() => setEditing(c)}>
                      Modifier
                    </button>
                    <button className="btn btn-ghost danger" onClick={() => setDeleting(c)}>
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <CategoryForm
          initial={editing === 'new' ? null : editing}
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          message={`Supprimer la catégorie « ${deleting.nom} » ?`}
          onConfirm={confirmDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
