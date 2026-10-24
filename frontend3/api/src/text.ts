// Compare sans casse ni accents : « electronique » retrouve « Électronique ».
export const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export const tokens = (s: string) => normalize(s).split(/[^a-z0-9]+/).filter(Boolean);

/** Date lue ou saisie (JJ/MM/AAAA, JJ-MM-AAAA, JJ.MM.AAAA ou AAAA-MM-JJ) -> AAAA-MM-JJ, ou null. */
export function toIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let [y, mo, d] = m ? [m[1], m[2], m[3]] : ['', '', ''];
  if (!m) {
    m = s.match(/^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{4})$/);
    if (!m) return null;
    [d, mo, y] = [m[1], m[2], m[3]];
  }
  const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso) ? iso : null;
}

export const frDate = (iso: string) => iso.split('-').reverse().join('/');
