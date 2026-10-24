export type Severity = 'urgent' | 'attention' | 'info' | 'ok';
export type Verdict = 'urgent' | 'attention' | 'ok';
export type Level = 'info' | 'warn' | 'error';

export interface Container {
  name: string;
  service: string;
  project: string;
  image: string;
  state: string;
  health: string | null;
  restarts: number;
  oom_killed: boolean;
  exit_code: number | null;
  started_at: string | null;
  mem_usage: number | null;
  mem_limit: number | null;
}

export interface Finding {
  severity: Severity;
  title: string;
  detail: string;
  command: string | null;
  source: string | null;
}

export interface Bucket {
  t: string;
  requests: number;
  errors: number;
  generations: number;
}

export interface Stats {
  window_hours: number;
  lines: number;
  noise_lines: number;
  services: Record<string, { lines?: number; noise?: number; errors?: number; warnings?: number }>;
  api: {
    requests: number;
    by_status: { '2xx': number; '4xx': number; '5xx': number };
    unauthorized: number;
    top_paths: [string, number][];
    clients: [string, number][];
  };
  llm: {
    generations: number;
    tokens_out: number;
    tokens_in: number;
    tps_avg: number | null;
    tps_min: number | null;
    prompt_tps_avg: number | null;
    gen_s_avg: number | null;
    gen_s_max: number | null;
    chat_errors: number;
    chat_s_max: number | null;
    loads: number;
    load_s_avg: number | null;
    cpu_busy_events: number;
  };
  scanners: { ip: string; hits: number; paths: string[] }[];
  error_samples: { service: string; ts: string; text: string }[];
  timeline: Bucket[];
  bucket_minutes: number;
}

export interface Overview {
  generated_at: string;
  verdict: Verdict;
  containers: Container[];
  stats: Stats;
  findings: Finding[];
}

export interface LogEvent {
  ts: string;
  service: string;
  level: Level;
  kind: string;
  noise: boolean;
  text: string;
}

export interface Fidelity {
  numbers_total: number;
  numbers_invented: number[];
  verdict_expected: string;
  verdict_used: string | null;
  verdict_ok: boolean;
  words: number;
  length_ok: boolean;
}

export interface Perf {
  first_token_s: number | null;
  total_s: number;
  completion_tokens: number | null;
  tokens_per_s: number | null;
}

export interface ReportSummary {
  id: string;
  created_at: string;
  window_hours: number;
  verdict: Verdict;
  fidelity: Fidelity;
  perf: Perf;
}

export interface Report extends ReportSummary {
  findings: Finding[];
  facts: string;
  text: string;
}
