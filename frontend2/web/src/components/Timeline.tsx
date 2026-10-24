import { useEffect, useRef, useState } from 'react';
import type { Bucket } from '../types';
import { fmtTime } from '../format';

const H = 180;
const PAD = { top: 12, right: 8, bottom: 24, left: 32 };

function niceMax(v: number) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow * 4 >= v)! * pow;
  return step * 4;
}

/** Barre aux coins supérieurs arrondis (4px), posée sur la ligne de base. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function Timeline({ buckets, bucketMinutes }: { buckets: Bucket[]; bucketMinutes: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = buckets.length || 1;
  const max = niceMax(Math.max(...buckets.map((b) => b.requests), 0));
  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const col = innerW / n;
  const barW = Math.max(1, col - 2); // 2px d'espace entre les barres
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const labelEvery = Math.ceil(n / Math.max(2, Math.floor(innerW / 70)));
  const total = buckets.reduce((s, b) => s + b.requests, 0);
  const hb = hover != null ? buckets[hover] : null;

  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Requêtes API dans le temps</h2>
        <button className="link-btn small" onClick={() => setTable((t) => !t)}>
          {table ? 'Voir le graphique' : 'Voir en tableau'}
        </button>
      </div>
      <p className="muted small chart-sub">
        {total} requête(s) · une barre = {bucketMinutes >= 60 ? `${bucketMinutes / 60} h` : `${bucketMinutes} min`}
      </p>

      {table ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Début</th><th>Requêtes</th><th>Générations</th><th>Erreurs 5xx</th></tr>
            </thead>
            <tbody>
              {buckets.filter((b) => b.requests || b.generations || b.errors).map((b) => (
                <tr key={b.t}><td>{fmtTime(b.t)}</td><td>{b.requests}</td><td>{b.generations}</td><td>{b.errors}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
          <svg width={width} height={H} role="img" aria-label={`Histogramme : ${total} requêtes sur la période`}>
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <g key={f}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(max * f)} y2={y(max * f)}
                  className={f === 0 ? 'axis-base' : 'grid'} />
                {(f === 0 || f === 0.5 || f === 1) && (
                  <text x={PAD.left - 6} y={y(max * f)} dy="0.32em" textAnchor="end" className="tick">{max * f}</text>
                )}
              </g>
            ))}
            {buckets.map((b, i) => {
              const x = PAD.left + i * col + 1;
              const h = (b.requests / max) * innerH;
              return (
                <g key={b.t}>
                  {b.requests > 0 && (
                    <path d={barPath(x, y(b.requests), barW, h)} className={`bar${hover === i ? ' active' : ''}`} />
                  )}
                  {b.errors > 0 && <circle cx={x + barW / 2} cy={y(b.requests) - 7} r={4} className="err-dot" />}
                  {i % labelEvery === 0 && (
                    <text x={x + barW / 2} y={H - 6} textAnchor="middle" className="tick">{fmtTime(b.t)}</text>
                  )}
                  <rect x={PAD.left + i * col} y={PAD.top} width={col} height={innerH} fill="transparent"
                    onMouseEnter={() => setHover(i)} />
                </g>
              );
            })}
          </svg>
          {hb && hover != null && (
            <div className="tooltip" style={{
              left: Math.min(width - 170, Math.max(0, PAD.left + hover * col + col / 2 - 80)),
              top: 0,
            }}>
              <div className="tooltip-title">{fmtTime(hb.t)}</div>
              <div><span className="swatch" /> {hb.requests} requête(s)</div>
              <div className="muted">{hb.generations} génération(s)</div>
              {hb.errors > 0 && <div className="err-text">{hb.errors} erreur(s) serveur</div>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
