import type { Fidelity, LogEvent, Overview, Perf, Report, ReportSummary } from './types';

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || `Erreur ${res.status}`);
  }
  return res.json();
}

export const fetchOverview = (hours: number) => get<Overview>(`/api/overview?hours=${hours}`);
export const fetchReports = () => get<ReportSummary[]>('/api/reports');
export const fetchReport = (id: string) => get<Report>(`/api/reports/${encodeURIComponent(id)}`);

export interface LogQuery {
  hours: number;
  service?: string;
  level?: string;
  q?: string;
  noise?: boolean;
}

export function fetchLogs(query: LogQuery) {
  const p = new URLSearchParams({ hours: String(query.hours), limit: '400' });
  if (query.service) p.set('service', query.service);
  if (query.level) p.set('level', query.level);
  if (query.q) p.set('q', query.q);
  if (query.noise) p.set('noise', 'true');
  return get<{ events: LogEvent[]; total_lines: number }>(`/api/logs?${p}`);
}

export type ReportEvent =
  | { type: 'meta'; verdict: string; facts: string }
  | { type: 'delta'; text: string }
  | { type: 'done'; id: string; fidelity: Fidelity; perf: Perf }
  | { type: 'error'; message: string };

/** Lit le flux SSE de POST /api/report et appelle onEvent pour chaque message. */
export async function streamReport(hours: number, onEvent: (e: ReportEvent) => void, signal: AbortSignal) {
  const res = await fetch('/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hours }),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || `Erreur ${res.status}`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const line = chunk.split('\n').find((l) => l.startsWith('data:'));
      if (line) onEvent(JSON.parse(line.slice(5)));
    }
  }
}
