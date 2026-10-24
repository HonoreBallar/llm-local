import { HttpError } from './http.js';

const GATEWAY_URL = process.env.LLM_GATEWAY_URL || 'http://localhost:4000';
const API_KEY = process.env.LLM_API_KEY || '';

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface LlmAnswer {
  content: string | null;
  tool_calls?: ToolCall[];
}

/** Appel /v1/chat/completions de la passerelle LiteLLM (format OpenAI). */
export async function completion(body: Record<string, unknown>, timeoutMs: number): Promise<LlmAnswer> {
  const res = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('Passerelle LLM :', res.status, detail.slice(0, 500));
    throw new HttpError(502, 'Le LLM est indisponible. Le backend est-il démarré ?');
  }
  const data = (await res.json()) as { choices: { message: LlmAnswer }[] };
  return data.choices[0].message;
}
