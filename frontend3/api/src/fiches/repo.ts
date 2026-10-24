import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../db.js';
import { HttpError } from '../http.js';
import { normalize, tokens, toIsoDate } from '../text.js';
import { FICHE_TYPES, type FicheType } from './schema.js';

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'application/pdf'];

export type Donnees = Record<string, string>;

export interface FicheDocument {
  id: number;
  fiche_id: number;
  role: string;
  nom_fichier: string;
  mime: string;
  taille: number;
  stockage: string;
  created_at: string;
}

export interface Fiche {
  id: number;
  type: FicheType;
  donnees: Donnees;
  analyse: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  nb_documents?: number;
  documents?: Omit<FicheDocument, 'stockage'>[];
}

export const filePath = (doc: Pick<FicheDocument, 'stockage'>) => path.join(UPLOAD_DIR, doc.stockage);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEL_RE = /^\+?[\d\s.-]{8,20}$/;

/** Ne garde que les champs du type, nettoyés et validés. */
export function cleanDonnees(type: FicheType, input: unknown): Donnees {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: Donnees = {};
  for (const f of FICHE_TYPES[type].fields) {
    const v = raw[f.key];
    if (v !== undefined && v !== null && typeof v !== 'string')
      throw new HttpError(400, `${f.label} : valeur invalide.`);
    const value = (v ?? '').trim();
    if (!value) {
      if (f.required) throw new HttpError(400, `${f.label} est obligatoire.`);
      continue;
    }
    if (value.length > (f.type === 'textarea' ? 500 : 150))
      throw new HttpError(400, `${f.label} est trop long.`);
    if (f.type === 'date' && toIsoDate(value) !== value)
      throw new HttpError(400, `${f.label} : date invalide (AAAA-MM-JJ).`);
    if (f.type === 'select' && !f.options!.includes(value))
      throw new HttpError(400, `${f.label} : choisir parmi ${f.options!.join(', ')}.`);
    if (f.type === 'email' && !EMAIL_RE.test(value)) throw new HttpError(400, 'E-mail invalide.');
    if (f.type === 'tel' && !TEL_RE.test(value)) throw new HttpError(400, 'Téléphone invalide.');
    out[f.key] = value;
  }
  return out;
}

export async function listFiches(filter: { type?: FicheType; q?: string; expirees?: boolean }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.type) {
    params.push(filter.type);
    where.push(`f.type = $${params.length}`);
  }
  if (filter.q?.trim()) {
    params.push(`%${filter.q.trim()}%`);
    where.push(`f.donnees::text ILIKE $${params.length}`);
  }
  if (filter.expirees) {
    where.push(`f.type = 'cni' AND (f.donnees->>'date_expiration')::date < current_date`);
  }
  const { rows } = await pool.query<Fiche>(
    `SELECT f.*, (SELECT count(*)::int FROM fiche_documents d WHERE d.fiche_id = f.id) AS nb_documents
       FROM fiches f
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY f.updated_at DESC`,
    params,
  );
  return rows;
}

export async function getFiche(id: number): Promise<Fiche> {
  const { rows } = await pool.query<Fiche>(`SELECT * FROM fiches WHERE id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, 'Fiche introuvable.');
  const docs = await pool.query(
    `SELECT id, fiche_id, role, nom_fichier, mime, taille, created_at
       FROM fiche_documents WHERE fiche_id = $1 ORDER BY id`,
    [id],
  );
  return { ...rows[0], documents: docs.rows };
}

export async function createFiche(type: unknown, donnees: unknown): Promise<Fiche> {
  if (type !== 'cni' && type !== 'kyc') throw new HttpError(400, 'Type de fiche invalide (cni ou kyc).');
  const { rows } = await pool.query<Fiche>(
    `INSERT INTO fiches (type, donnees) VALUES ($1, $2) RETURNING *`,
    [type, cleanDonnees(type, donnees)],
  );
  return { ...rows[0], documents: [] };
}

/** Toute modification rend l'analyse précédente caduque : elle est effacée. */
export async function updateFiche(id: number, donnees: unknown): Promise<Fiche> {
  const current = await getFiche(id);
  assertNotAnalysing(current);
  await pool.query(
    `UPDATE fiches SET donnees = $1, "analyse" = NULL, updated_at = now() WHERE id = $2`,
    [cleanDonnees(current.type, donnees), id],
  );
  return getFiche(id);
}

export async function deleteFiche(id: number): Promise<void> {
  const docs = await pool.query<FicheDocument>(`SELECT stockage FROM fiche_documents WHERE fiche_id = $1`, [id]);
  const { rowCount } = await pool.query(`DELETE FROM fiches WHERE id = $1`, [id]);
  if (!rowCount) throw new HttpError(404, 'Fiche introuvable.');
  await Promise.all(docs.rows.map((d) => unlink(filePath(d)).catch(() => {})));
}

function assertNotAnalysing(fiche: Fiche) {
  if (fiche.analyse?.statut === 'en_cours')
    throw new HttpError(409, "Analyse en cours : attendre la fin avant de modifier la fiche.");
}

/** Vérifie les premiers octets : le type annoncé par le navigateur ne suffit pas. */
async function sniffMime(file: string): Promise<string | null> {
  const fh = await open(file, 'r');
  try {
    const { buffer } = await fh.read(Buffer.alloc(8), 0, 8, 0);
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
      return 'image/png';
    if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
    return null;
  } finally {
    await fh.close();
  }
}

export const newStorageName = () => randomUUID();

export async function addDocument(
  ficheId: number,
  role: unknown,
  file: { originalname: string; size: number; filename: string },
) {
  const stored = path.join(UPLOAD_DIR, file.filename);
  try {
    const fiche = await getFiche(ficheId);
    assertNotAnalysing(fiche);
    const def = FICHE_TYPES[fiche.type].documents.find((d) => d.role === role);
    if (!def) throw new HttpError(400, 'Type de document invalide pour cette fiche.');
    const mime = await sniffMime(stored);
    if (!mime) throw new HttpError(400, 'Fichier refusé : seuls JPG, PNG et PDF sont acceptés.');

    // Recto et verso : un seul fichier, le nouveau remplace l'ancien.
    const replaced = def.multiple
      ? []
      : (
          await pool.query<FicheDocument>(
            `DELETE FROM fiche_documents WHERE fiche_id = $1 AND role = $2 RETURNING stockage`,
            [ficheId, def.role],
          )
        ).rows;
    const nom = path.basename(file.originalname).slice(0, 255) || 'document';
    const { rows } = await pool.query(
      `INSERT INTO fiche_documents (fiche_id, role, nom_fichier, mime, taille, stockage)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, fiche_id, role, nom_fichier, mime, taille, created_at`,
      [ficheId, def.role, nom, mime, file.size, file.filename],
    );
    await pool.query(`UPDATE fiches SET "analyse" = NULL, updated_at = now() WHERE id = $1`, [ficheId]);
    await Promise.all(replaced.map((d) => unlink(filePath(d)).catch(() => {})));
    return rows[0];
  } catch (err) {
    await unlink(stored).catch(() => {});
    throw err;
  }
}

export async function getDocument(ficheId: number, docId: number): Promise<FicheDocument> {
  const { rows } = await pool.query<FicheDocument>(
    `SELECT * FROM fiche_documents WHERE id = $1 AND fiche_id = $2`,
    [docId, ficheId],
  );
  if (!rows[0]) throw new HttpError(404, 'Document introuvable.');
  return rows[0];
}

export async function deleteDocument(ficheId: number, docId: number): Promise<void> {
  assertNotAnalysing(await getFiche(ficheId));
  const doc = await getDocument(ficheId, docId);
  await pool.query(`DELETE FROM fiche_documents WHERE id = $1`, [docId]);
  await pool.query(`UPDATE fiches SET "analyse" = NULL, updated_at = now() WHERE id = $1`, [ficheId]);
  await unlink(filePath(doc)).catch(() => {});
}

export const fullName = (d: Donnees) => [d.nom, d.prenoms].filter(Boolean).join(' ');

/** Recherche tolérante pour le chatbot : tous les mots demandés doivent figurer dans « nom prénoms ». */
export async function findFicheByName(name: string, type?: FicheType): Promise<Fiche> {
  const wanted = tokens(name);
  if (!wanted.length) throw new HttpError(400, 'Nom de la personne manquant.');
  const all = await listFiches({ type });
  const matches = all.filter((f) => {
    const have = tokens(fullName(f.donnees));
    return wanted.every((w) => have.includes(w));
  });
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const exact = matches.filter((f) => normalize(fullName(f.donnees)) === normalize(name));
    if (exact.length === 1) return exact[0];
    throw new HttpError(
      409,
      `Plusieurs fiches correspondent : ${matches.map((f) => `${fullName(f.donnees)} (${f.type.toUpperCase()})`).join(', ')}. Laquelle ?`,
    );
  }
  throw new HttpError(404, `Aucune fiche${type ? ` ${type.toUpperCase()}` : ''} pour « ${name.trim()} ».`);
}
