import type { Stats } from '../types';
import { fmtDuration, fmtNum } from '../format';

interface Tile {
  label: string;
  value: string;
  hint: string;
  alert?: boolean;
}

export function Kpis({ stats }: { stats: Stats }) {
  const { api, llm } = stats;
  const failed = api.by_status['4xx'] + api.by_status['5xx'];
  const tiles: Tile[] = [
    {
      label: 'Requêtes API',
      value: fmtNum(api.requests, 0),
      hint: failed ? `${failed} refusée(s) ou en échec` : 'hors sondes de santé',
      alert: api.by_status['5xx'] > 0,
    },
    {
      label: 'Réponses générées',
      value: fmtNum(llm.generations, 0),
      hint: `${fmtNum(llm.tokens_out, 0)} tokens écrits`,
    },
    {
      label: 'Vitesse du modèle',
      value: llm.tps_avg == null ? '—' : `${fmtNum(llm.tps_avg)} t/s`,
      hint: llm.tps_min == null ? 'aucune génération' : `au plus lent ${fmtNum(llm.tps_min)} t/s`,
      alert: llm.tps_avg != null && llm.tps_avg < 3,
    },
    {
      label: 'Durée d’une réponse',
      value: fmtDuration(llm.gen_s_avg),
      hint: llm.gen_s_max == null ? 'en moyenne' : `max ${fmtDuration(llm.gen_s_max)}`,
      alert: (llm.gen_s_max ?? 0) > 300,
    },
    {
      label: 'Chargements du modèle',
      value: fmtNum(llm.loads, 0),
      hint: llm.load_s_avg == null ? 'en mémoire' : `≈ ${fmtDuration(llm.load_s_avg)} chacun`,
      alert: llm.loads >= 3,
    },
    {
      label: 'Lignes de log lues',
      value: fmtNum(stats.lines, 0),
      hint: `dont ${fmtNum(stats.noise_lines, 0)} de bruit`,
    },
  ];
  return (
    <section className="kpis" aria-label="Indicateurs">
      {tiles.map((t) => (
        <div key={t.label} className={`kpi${t.alert ? ' alert' : ''}`}>
          <div className="kpi-label">{t.label}</div>
          <div className="kpi-value">{t.value}</div>
          <div className="kpi-hint muted">{t.hint}</div>
        </div>
      ))}
    </section>
  );
}
