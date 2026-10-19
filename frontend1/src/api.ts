// Le navigateur appelle /api/... ; nginx (ou Vite en dev) relaie vers la passerelle avec la clé.
const BASE = '/api';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
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
  const r = await fetch(`${BASE}/v1/models`);
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      stream: true,
    }),
    signal: opts.signal,
  });

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
