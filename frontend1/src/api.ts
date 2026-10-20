// Le navigateur appelle /api/... ; nginx (Docker), Vite (dev) ou la fonction Vercel (prod)
// relaie vers la passerelle avec la clé. Sur Vercel, un mot de passe d'appli est en plus exigé.
const BASE = '/api';
const PASSWORD_KEY = 'llm-local.password';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Levée quand la fonction Vercel exige le mot de passe de l'appli. */
export class AuthError extends Error {}

export function getPassword(): string {
  try {
    return localStorage.getItem(PASSWORD_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setPassword(password: string | null): void {
  try {
    if (password) localStorage.setItem(PASSWORD_KEY, password);
    else localStorage.removeItem(PASSWORD_KEY);
  } catch {
    /* stockage indisponible : le mot de passe sera redemandé */
  }
}

function authHeaders(password = getPassword()): Record<string, string> {
  return password ? { 'x-app-password': password } : {};
}

const needsPassword = (r: Response) => r.status === 401 && r.headers.get('x-auth-required') === 'password';

/** true si l'accès est autorisé (ou si aucun mot de passe n'est exigé, en local). */
export async function checkAuth(password?: string): Promise<boolean> {
  const r = await fetch(`${BASE}/__auth`, { headers: authHeaders(password), cache: 'no-store' });
  return !needsPassword(r);
}

export async function checkHealth(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/health/liveliness`, { cache: 'no-store' });
    return r.ok;
  } catch {
    return false;
  }
}

export async function listModels(): Promise<string[]> {
  const r = await fetch(`${BASE}/v1/models`, { headers: authHeaders() });
  if (needsPassword(r)) throw new AuthError('Mot de passe requis');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const json = await r.json();
  return (json.data ?? []).map((m: { id: string }) => m.id);
}

function errorMessage(status: number, body: string): string {
  try {
    const j = JSON.parse(body);
    const msg = j.error?.message ?? j.detail ?? j.message;
    if (msg) return `Erreur ${status} : ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`;
  } catch {
    /* corps non JSON */
  }
  if (status === 502 || status === 504) return `Erreur ${status} : le backend ne répond pas. Est-il démarré ?`;
  return `Erreur ${status}${body ? ` : ${body.slice(0, 200)}` : ''}`;
}

export async function streamChat(opts: {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  signal: AbortSignal;
  onToken: (text: string) => void;
}): Promise<void> {
  const r = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      stream: true,
    }),
    signal: opts.signal,
  });

  if (needsPassword(r)) throw new AuthError('Mot de passe requis');
  if (!r.ok || !r.body) {
    const body = await r.text().catch(() => '');
    throw new Error(errorMessage(r.status, body));
  }

  // Flux SSE : lignes "data: {...}" terminées par "data: [DONE]".
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') return;
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      if (json.error) throw new Error(json.error.message ?? 'Erreur pendant la génération');
      const token = json.choices?.[0]?.delta?.content;
      if (token) opts.onToken(token);
    }
  }
}
