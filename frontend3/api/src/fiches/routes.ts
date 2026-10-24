import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { HttpError } from '../http.js';
import { startAnalyse } from './analyse.js';
import {
  addDocument,
  ALLOWED_MIME,
  createFiche,
  deleteDocument,
  deleteFiche,
  filePath,
  getDocument,
  getFiche,
  listFiches,
  MAX_FILE_SIZE,
  newStorageName,
  UPLOAD_DIR,
  updateFiche,
} from './repo.js';
import { FICHE_TYPES, isFicheType } from './schema.js';

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    // Nom aléatoire sans extension : le nom d'origine n'est jamais utilisé comme chemin.
    filename: (_req, _file, cb) => cb(null, newStorageName()),
  }),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) =>
    ALLOWED_MIME.includes(file.mimetype)
      ? cb(null, true)
      : cb(new HttpError(400, 'Formats acceptés : JPG, PNG, PDF.')),
});

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identifiant invalide.');
  return id;
}

export const fichesRouter = Router();

fichesRouter.get('/types', (_req, res) => {
  res.json(Object.values(FICHE_TYPES).map(({ fields, ...t }) => ({
    ...t,
    fields: fields.map(({ compare: _compare, ...f }) => f),
  })));
});

fichesRouter.get('/', wrap(async (req, res) => {
  const type = isFicheType(req.query.type) ? req.query.type : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  res.json(await listFiches({ type, q, expirees: req.query.expirees === '1' }));
}));

fichesRouter.get('/:id', wrap(async (req, res) => {
  res.json(await getFiche(parseId(req.params.id)));
}));

fichesRouter.post('/', wrap(async (req, res) => {
  res.status(201).json(await createFiche(req.body?.type, req.body?.donnees));
}));

fichesRouter.put('/:id', wrap(async (req, res) => {
  res.json(await updateFiche(parseId(req.params.id), req.body?.donnees));
}));

fichesRouter.delete('/:id', wrap(async (req, res) => {
  await deleteFiche(parseId(req.params.id));
  res.status(204).end();
}));

fichesRouter.post('/:id/documents', (req, res, next) => {
  upload.single('fichier')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError)
      return next(new HttpError(400, err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop lourd (10 Mo maximum).' : err.message));
    if (err) return next(err);
    if (!req.file) return next(new HttpError(400, 'Aucun fichier reçu (champ « fichier »).'));
    addDocument(parseId(req.params.id), req.body?.role, req.file)
      .then((doc) => res.status(201).json(doc))
      .catch(next);
  });
});

fichesRouter.get('/:id/documents/:docId', wrap(async (req, res) => {
  const doc = await getDocument(parseId(req.params.id), parseId(req.params.docId));
  res.setHeader('Content-Type', doc.mime);
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.nom_fichier)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(filePath(doc));
}));

fichesRouter.delete('/:id/documents/:docId', wrap(async (req, res) => {
  await deleteDocument(parseId(req.params.id), parseId(req.params.docId));
  res.status(204).end();
}));

fichesRouter.post('/:id/analyse', wrap(async (req, res) => {
  res.status(202).json(await startAnalyse(parseId(req.params.id)));
}));
