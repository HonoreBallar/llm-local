import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { pool } from '../db.js';
import { HttpError } from '../http.js';
import { completion } from '../llm.js';
import { frDate, normalize, tokens, toIsoDate } from '../text.js';
import { filePath, fullName, getFiche, type Donnees, type Fiche, type FicheDocument } from './repo.js';
import { FICHE_TYPES, type FicheType } from './schema.js';

const VISION_MODEL = process.env.LLM_VISION_ALIAS || 'vision';
const MAX_IMAGES = 2; // CPU : chaque image ajoute environ une minute d'analyse
const MAX_SIDE = 1600;
const MIN_CONFIANCE = 60;
const KYC_MAX_AGE_DAYS = 92; // justificatif de domicile : moins de 3 mois

export type Verdict = 'conforme' | 'a_verifier' | 'non_conforme';

export interface ChampCompare {
  key: string;
  label: string;
  fiche: string | null;
  lu: string | null;
  statut: 'ok' | 'ecart' | 'non_lu';
}

export type Analyse =
  | { statut: 'en_cours'; lance_le: string }
  | { statut: 'erreur'; lance_le: string; message: string }
  | {
      statut: 'termine';
      lance_le: string;
      termine_le: string;
      duree_s: number;
      verdict: Verdict;
      est_document_attendu: boolean;
      type_detecte: string;
      confiance: number;
      raisons: string[];
      champs: ChampCompare[];
      alertes: string[];
      documents: string[];
    };

// ---------- Consignes données au modèle de vision ----------

const JSON_RULES = `Recopie les informations exactement comme elles sont écrites ; mets null si tu ne peux pas les lire.
Dates au format JJ/MM/AAAA. Écris type_detecte et raisons en français.
Réponds UNIQUEMENT avec un objet JSON, sans texte autour.`;

function prompt(type: FicheType, roles: string[]): string {
  if (type === 'cni')
    return `Tu es agent de conformité dans une institution financière en Côte d'Ivoire.
Tu reçois ${roles.length} image(s) : ${roles.join(', ')}.
Question : ces images montrent-elles une Carte Nationale d'Identité (CNI) de la République de Côte d'Ivoire ?
Indices d'une CNI ivoirienne : mentions « RÉPUBLIQUE DE CÔTE D'IVOIRE » et « CARTE NATIONALE D'IDENTITÉ », photo d'identité, nom, prénoms, date et lieu de naissance, sexe, numéro de carte (souvent « CI » suivi de chiffres), dates de délivrance et d'expiration ; au verso, parfois une zone MRZ (lignes avec des « < »).
Un passeport, un permis de conduire, une carte d'électeur, une carte d'un autre pays, une facture ou une photo quelconque ne sont PAS une CNI ivoirienne.
${JSON_RULES}
Format :
{"est_document_attendu": true ou false, "type_detecte": "nature exacte du document vu", "confiance": 0 à 100, "raisons": ["indice 1", "indice 2"], "champs_lus": {"nom": "...", "prenoms": "...", "sexe": "M ou F", "date_naissance": "...", "lieu_naissance": "...", "numero_cni": "...", "date_delivrance": "...", "date_expiration": "..."}}`;

  return `Tu es agent de conformité (KYC, connaissance client) dans une institution financière en Côte d'Ivoire.
Tu reçois ${roles.length} justificatif(s) fourni(s) pour le dossier KYC d'un client.
Question : est-ce un justificatif KYC recevable ? Sont recevables :
- un justificatif de domicile : facture CIE (électricité) ou SODECI (eau), quittance de loyer, attestation de résidence, relevé bancaire ;
- un formulaire KYC ou d'ouverture de compte rempli (et si possible signé) ;
- un justificatif de revenus : bulletin de salaire, attestation de travail.
Ne sont PAS recevables : une photo quelconque, une capture sans rapport, un document illisible, ou une pièce d'identité seule (elle va dans une fiche CNI).
${JSON_RULES}
Format :
{"est_document_attendu": true ou false, "type_detecte": "nature exacte du document vu", "confiance": 0 à 100, "raisons": ["indice 1", "indice 2"], "champs_lus": {"nom": "...", "prenoms": "...", "adresse": "...", "date_document": "date d'émission du document"}}`;
}

// ---------- Préparation des images ----------

const run = promisify(execFile);

/** Image JPEG réduite, en base64. Un PDF est converti (1re page) avec pdftoppm (poppler). */
async function toJpegBase64(doc: FicheDocument): Promise<string> {
  let input: Buffer;
  if (doc.mime === 'application/pdf') {
    const dir = await mkdtemp(path.join(tmpdir(), 'pdf-'));
    try {
      await run('pdftoppm', ['-jpeg', '-r', '150', '-f', '1', '-l', '1', filePath(doc), path.join(dir, 'p')]);
      const [page] = await readdir(dir);
      if (!page) throw new Error('PDF vide');
      input = await readFile(path.join(dir, page));
    } catch (err) {
      console.error('Conversion PDF :', err);
      throw new HttpError(422, `Impossible de lire le PDF « ${doc.nom_fichier} ».`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  } else {
    input = await readFile(filePath(doc));
  }
  const out = await sharp(input)
    .rotate() // respecte l'orientation EXIF des photos de téléphone
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return out.toString('base64');
}

// ---------- Lecture de la réponse ----------

interface VisionAnswer {
  est_document_attendu: boolean;
  type_detecte: string;
  confiance: number;
  raisons: string[];
  champs_lus: Record<string, unknown>;
}

function parseAnswer(content: string | null): VisionAnswer {
  const text = content ?? '';
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    console.error('Réponse vision illisible :', text.slice(0, 500));
    throw new HttpError(502, "Le modèle n'a pas renvoyé de réponse exploitable. Relancer l'analyse.");
  }
  const confiance = Math.round(Number(data.confiance));
  return {
    est_document_attendu: data.est_document_attendu === true || data.est_document_attendu === 'true',
    type_detecte: typeof data.type_detecte === 'string' ? data.type_detecte : 'inconnu',
    confiance: Number.isFinite(confiance) ? Math.min(100, Math.max(0, confiance)) : 0,
    raisons: Array.isArray(data.raisons) ? data.raisons.filter((r) => typeof r === 'string').slice(0, 8) : [],
    champs_lus: data.champs_lus && typeof data.champs_lus === 'object' ? (data.champs_lus as Record<string, unknown>) : {},
  };
}

const readValue = (v: unknown) =>
  typeof v === 'string' && v.trim() && !/^(null|n\/a|-|illisible)$/i.test(v.trim()) ? v.trim() : null;

// ---------- Comparaison fiche / document ----------

/** Noms : les petits modèles mélangent nom et prénoms, on compare donc les mots de l'ensemble. */
function compareNames(fiche: Donnees, lus: Record<string, unknown>): ChampCompare {
  const ficheName = fullName(fiche);
  const lu = [readValue(lus.nom), readValue(lus.prenoms)].filter(Boolean).join(' ') || null;
  const base = { key: 'nom_complet', label: 'Nom et prénoms', fiche: ficheName || null, lu };
  if (!lu) return { ...base, statut: 'non_lu' };
  const a = new Set(tokens(ficheName));
  const b = new Set(tokens(lu));
  const ok = [...b].every((t) => a.has(t)) || [...a].every((t) => b.has(t));
  return { ...base, statut: ok ? 'ok' : 'ecart' };
}

function sameValue(kind: 'date' | 'id' | 'text', fiche: string, lu: string): boolean {
  if (kind === 'date') return toIsoDate(fiche) === toIsoDate(lu);
  if (kind === 'id') {
    const clean = (s: string) => normalize(s).replace(/[^a-z0-9]/g, '');
    return clean(fiche) === clean(lu);
  }
  // Texte libre (adresse, lieu) : assez de mots en commun.
  const a = tokens(fiche);
  const b = new Set(tokens(lu));
  if (!a.length) return false;
  return a.filter((t) => b.has(t)).length / a.length >= 0.5 || normalize(lu).includes(normalize(fiche));
}

function compare(fiche: Fiche, lus: Record<string, unknown>): ChampCompare[] {
  const rows = [compareNames(fiche.donnees, lus)];
  for (const f of FICHE_TYPES[fiche.type].fields) {
    if (!f.compare) continue;
    const ficheValue = fiche.donnees[f.key] ?? null;
    const lu = readValue(lus[f.key]);
    if (!ficheValue && !lu) continue;
    const shown = f.type === 'date' && ficheValue ? frDate(ficheValue) : ficheValue;
    let statut: ChampCompare['statut'] = 'non_lu';
    // Le modèle écrit parfois « non lisible » au lieu de null : une date illisible n'est pas un écart.
    if (f.compare === 'date' && lu && !toIsoDate(lu)) statut = 'non_lu';
    else if (lu && ficheValue) statut = sameValue(f.compare, ficheValue, lu) ? 'ok' : 'ecart';
    else if (lu) statut = 'ok'; // rien à comparer côté fiche : simple information
    rows.push({ key: f.key, label: f.label, fiche: shown, lu, statut });
  }
  return rows;
}

function alerts(fiche: Fiche, answer: VisionAnswer): string[] {
  const out: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  if (fiche.type === 'cni') {
    const exp = fiche.donnees.date_expiration || toIsoDate(readValue(answer.champs_lus.date_expiration));
    if (exp && exp < today) out.push(`La CNI est expirée depuis le ${frDate(exp)}.`);
  } else {
    const date = toIsoDate(readValue(answer.champs_lus.date_document));
    if (date) {
      const age = (Date.parse(today) - Date.parse(date)) / 86_400_000;
      if (age > KYC_MAX_AGE_DAYS) out.push(`Le justificatif date du ${frDate(date)} : plus de 3 mois.`);
    }
  }
  if (answer.confiance < MIN_CONFIANCE)
    out.push(`Confiance faible du modèle (${answer.confiance} %) : vérifier manuellement.`);
  return out;
}

// ---------- Exécution (file d'attente : un seul modèle à la fois sur CPU) ----------

let queue: Promise<unknown> = Promise.resolve();

async function saveAnalyse(id: number, analyse: Analyse) {
  await pool.query(`UPDATE fiches SET "analyse" = $1 WHERE id = $2`, [analyse, id]);
}

async function runAnalyse(id: number, lanceLe: string): Promise<void> {
  const started = Date.now();
  const fiche = await getFiche(id);
  const { rows: docs } = await pool.query<FicheDocument>(
    `SELECT * FROM fiche_documents WHERE fiche_id = $1 ORDER BY id LIMIT ${MAX_IMAGES}`,
    [id],
  );
  const order = FICHE_TYPES[fiche.type].documents.map((d) => d.role);
  docs.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
  const images = await Promise.all(docs.map(toJpegBase64));

  const answer = parseAnswer(
    (
      await completion(
        {
          model: VISION_MODEL,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt(fiche.type, docs.map((d) => `${d.role} (${d.nom_fichier})`)) },
                ...images.map((b64) => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } })),
              ],
            },
          ],
        },
        900_000,
      )
    ).content,
  );

  const champs = compare(fiche, answer.champs_lus);
  const alertes = alerts(fiche, answer);
  const verdict: Verdict = !answer.est_document_attendu
    ? 'non_conforme'
    : champs.some((c) => c.statut === 'ecart') || alertes.length
      ? 'a_verifier'
      : 'conforme';

  await saveAnalyse(id, {
    statut: 'termine',
    lance_le: lanceLe,
    termine_le: new Date().toISOString(),
    duree_s: Math.round((Date.now() - started) / 1000),
    verdict,
    est_document_attendu: answer.est_document_attendu,
    type_detecte: answer.type_detecte,
    confiance: answer.confiance,
    raisons: answer.raisons,
    champs,
    alertes,
    documents: docs.map((d) => d.nom_fichier),
  });
}

/** Lance l'analyse en tâche de fond ; le front suit l'avancement via analyse.statut. */
export async function startAnalyse(id: number): Promise<Fiche> {
  const fiche = await getFiche(id);
  if (fiche.analyse?.statut === 'en_cours') throw new HttpError(409, 'Une analyse est déjà en cours.');
  for (const def of FICHE_TYPES[fiche.type].documents) {
    if (def.required && !fiche.documents!.some((d) => d.role === def.role))
      throw new HttpError(400, `Ajouter d'abord un document : ${def.label}.`);
  }
  const lanceLe = new Date().toISOString();
  await saveAnalyse(id, { statut: 'en_cours', lance_le: lanceLe });

  queue = queue.then(() =>
    runAnalyse(id, lanceLe).catch(async (err) => {
      if (!(err instanceof HttpError)) console.error(`Analyse fiche ${id} :`, err);
      const message =
        err instanceof HttpError
          ? err.message
          : err?.name === 'TimeoutError'
            ? "Le modèle a mis trop de temps à répondre. Relancer l'analyse."
            : "Erreur pendant l'analyse.";
      await saveAnalyse(id, { statut: 'erreur', lance_le: lanceLe, message }).catch(() => {});
    }),
  );
  return getFiche(id);
}

/** Au démarrage : une analyse « en cours » a été interrompue par l'arrêt du serveur. */
export async function resetInterruptedAnalyses() {
  await pool.query(
    `UPDATE fiches
        SET "analyse" = "analyse" || '{"statut": "erreur", "message": "Analyse interrompue par un redémarrage. La relancer."}'
      WHERE "analyse"->>'statut' = 'en_cours'`,
  );
}
