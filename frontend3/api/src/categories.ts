import { pool } from './db.js';
import { HttpError } from './http.js';
import { normalize } from './text.js';

export interface Category {
  id: number;
  nom: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

const NOM_MAX = 100;
const DESCRIPTION_MAX = 500;

function cleanNom(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, 'Le nom est obligatoire.');
  const nom = value.trim();
  if (nom.length > NOM_MAX) throw new HttpError(400, `Le nom dépasse ${NOM_MAX} caractères.`);
  return nom;
}

function cleanDescription(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new HttpError(400, 'La description doit être un texte.');
  const description = value.trim();
  if (description.length > DESCRIPTION_MAX)
    throw new HttpError(400, `La description dépasse ${DESCRIPTION_MAX} caractères.`);
  return description || null;
}

function translatePgError(err: unknown): never {
  if ((err as { code?: string }).code === '23505')
    throw new HttpError(409, 'Une catégorie porte déjà ce nom.');
  throw err;
}

export async function listCategories(search?: string): Promise<Category[]> {
  const term = search?.trim();
  const { rows } = term
    ? await pool.query<Category>(
        `SELECT * FROM categories WHERE nom ILIKE $1 OR description ILIKE $1 ORDER BY lower(nom)`,
        [`%${term}%`],
      )
    : await pool.query<Category>(`SELECT * FROM categories ORDER BY lower(nom)`);
  return rows;
}

export async function getCategory(id: number): Promise<Category> {
  const { rows } = await pool.query<Category>(`SELECT * FROM categories WHERE id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, 'Catégorie introuvable.');
  return rows[0];
}

// Recherche tolérante pour le chatbot : nom exact (normalisé), sinon un seul nom approchant
// (l'un contient l'autre, ex. « Sports et loisirs : plein air » -> « Sports et loisirs »).
export async function findCategoryByName(nom: string): Promise<Category> {
  const wanted = normalize(nom);
  if (!wanted) throw new HttpError(400, 'Nom de catégorie manquant.');
  const all = await listCategories();
  const exact = all.find((c) => normalize(c.nom) === wanted);
  if (exact) return exact;
  const close = all.filter((c) => {
    const n = normalize(c.nom);
    return wanted.includes(n) || n.includes(wanted);
  });
  if (close.length === 1) return close[0];
  if (close.length > 1)
    throw new HttpError(409, `Plusieurs catégories correspondent : ${close.map((c) => c.nom).join(', ')}. Laquelle ?`);
  throw new HttpError(404, `Aucune catégorie nommée « ${nom.trim()} ».`);
}

export async function createCategory(input: { nom?: unknown; description?: unknown }): Promise<Category> {
  const nom = cleanNom(input.nom);
  const description = cleanDescription(input.description);
  try {
    const { rows } = await pool.query<Category>(
      `INSERT INTO categories (nom, description) VALUES ($1, $2) RETURNING *`,
      [nom, description],
    );
    return rows[0];
  } catch (err) {
    translatePgError(err);
  }
}

export async function updateCategory(
  id: number,
  input: { nom?: unknown; description?: unknown },
): Promise<Category> {
  const current = await getCategory(id);
  const nom = input.nom === undefined ? current.nom : cleanNom(input.nom);
  const description =
    input.description === undefined ? current.description : cleanDescription(input.description);
  try {
    const { rows } = await pool.query<Category>(
      `UPDATE categories SET nom = $1, description = $2, updated_at = now() WHERE id = $3 RETURNING *`,
      [nom, description, id],
    );
    return rows[0];
  } catch (err) {
    translatePgError(err);
  }
}

export async function deleteCategory(id: number): Promise<void> {
  const { rowCount } = await pool.query(`DELETE FROM categories WHERE id = $1`, [id]);
  if (!rowCount) throw new HttpError(404, 'Catégorie introuvable.');
}
