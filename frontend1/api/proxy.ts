// Fonction Vercel : remplace nginx en production.
// Vérifie le mot de passe de l'appli, ajoute la clé API et relaie (streaming compris) vers le VPS
// en HTTPS, en ne faisant confiance qu'au certificat racine du VPS (LLM_API_CA).
import { createHash, timingSafeEqual } from 'node:crypto';
import { Agent, fetch } from 'undici';

const API_URL = (process.env.LLM_API_URL ?? '').replace(/\/$/, '');
const API_KEY = process.env.LLM_API_KEY ?? '';
const APP_PASSWORD = process.env.APP_PASSWORD ?? '';
const CA = (process.env.LLM_API_CA ?? '').replace(/\\n/g, '\n');

// Seules ces routes de l'API sont relayées.
const ALLOWED = /^(v1\/(chat\/completions|messages|models)|health\/liveliness)$/;
const PUBLIC = new Set(['health/liveliness']);

const dispatcher = new Agent({
  connect: CA ? { ca: CA } : {},
  headersTimeout: 600_000,
  bodyTimeout: 600_000,
});

function digest(s: string) {
  return createHash('sha256').update(s).digest();
}

function passwordOk(given: string | null): boolean {
  if (!APP_PASSWORD) return false;
  return timingSafeEqual(digest(given ?? ''), digest(APP_PASSWORD));
}

function json(status: number, body: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
  });
}

const unauthorized = () =>
  json(401, { error: { message: 'Mot de passe requis' } }, { 'x-auth-required': 'password' });

async function handler(request: Request): Promise<Response> {
  if (!API_URL || !API_KEY || !APP_PASSWORD || !CA) {
    return json(500, { error: { message: 'Configuration Vercel incomplète (LLM_API_URL, LLM_API_KEY, LLM_API_CA, APP_PASSWORD)' } });
  }

  const path = new URL(request.url).searchParams.get('path') ?? '';
  const password = request.headers.get('x-app-password');

  if (path === '__auth') {
    if (passwordOk(password)) return new Response(null, { status: 204 });
    await new Promise((r) => setTimeout(r, 500)); // freine les essais en rafale
    return unauthorized();
  }
  if (!ALLOWED.test(path)) return json(404, { error: { message: 'Route inconnue' } });
  if (!PUBLIC.has(path) && !passwordOk(password)) return unauthorized();

  try {
    const upstream = await fetch(`${API_URL}/${path}`, {
      method: request.method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${API_KEY}`,
      },
      body: request.method === 'POST' ? await request.text() : undefined,
      dispatcher,
      signal: request.signal,
    });
    return new Response(upstream.body as ReadableStream | null, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    return json(502, { error: { message: `Le serveur LLM ne répond pas (${(e as Error).message})` } });
  }
}

export const GET = handler;
export const POST = handler;
