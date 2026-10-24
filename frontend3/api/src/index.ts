import express, { type NextFunction, type Request, type Response } from 'express';
import {
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  updateCategory,
} from './categories.js';
import { HttpError } from './http.js';
import { chat } from './chat.js';
import { migrate, pool } from './db.js';
import { resetInterruptedAnalyses } from './fiches/analyse.js';
import { fichesRouter } from './fiches/routes.js';

const app = express();
app.use(express.json({ limit: '100kb' }));

// Express 4 ne transmet pas les rejets de promesse : on les renvoie au gestionnaire d'erreurs.
const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identifiant invalide.');
  return id;
}

app.get('/api/health', wrap(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
}));

app.get('/api/categories', wrap(async (req, res) => {
  res.json(await listCategories(typeof req.query.q === 'string' ? req.query.q : undefined));
}));

app.get('/api/categories/:id', wrap(async (req, res) => {
  res.json(await getCategory(parseId(req.params.id)));
}));

app.post('/api/categories', wrap(async (req, res) => {
  res.status(201).json(await createCategory(req.body ?? {}));
}));

app.put('/api/categories/:id', wrap(async (req, res) => {
  res.json(await updateCategory(parseId(req.params.id), req.body ?? {}));
}));

app.delete('/api/categories/:id', wrap(async (req, res) => {
  await deleteCategory(parseId(req.params.id));
  res.status(204).end();
}));

app.use('/api/fiches', fichesRouter);

app.post('/api/chat', wrap(async (req, res) => {
  const messages = req.body?.messages;
  if (!Array.isArray(messages) || !messages.length) throw new HttpError(400, 'Aucun message.');
  res.json(await chat(messages));
}));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof SyntaxError) return res.status(400).json({ error: 'JSON invalide.' });
  console.error(err);
  res.status(500).json({ error: 'Erreur interne.' });
});

const port = Number(process.env.PORT) || 8080;
await migrate();
await resetInterruptedAnalyses();
app.listen(port, () => console.log(`API catégories sur :${port}`));
