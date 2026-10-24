export const fmtNum = (n: number | null | undefined, digits = 1) =>
  n == null ? '—' : n.toLocaleString('fr-FR', { maximumFractionDigits: digits });

export function fmtDuration(s: number | null | undefined) {
  if (s == null) return '—';
  if (s < 60) return `${fmtNum(s)} s`;
  return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

export function fmtBytes(b: number | null) {
  if (b == null) return '—';
  const gb = b / 1024 ** 3;
  return gb >= 1 ? `${fmtNum(gb)} Go` : `${Math.round(b / 1024 ** 2)} Mo`;
}

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function fmtLogTs(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('fr-FR')}`;
}
