'use client';

import { useMemo, useState } from 'react';
import { formatBRL } from '@/lib/money';
import { ChartCard, Legend, EmptyChart, SERIES_VARS, MAX_SERIES, niceTicks, monthLabel, useWidth } from './shared';
import type { MonthlyPoint } from '@/lib/queries';

const PAD = { top: 14, right: 8, bottom: 28, left: 58 };
const HEIGHT = 250;
const GAP = 2; // 2px de superfície entre segmentos empilhados — nunca uma borda

/**
 * Gasto por mês, empilhado por categoria.
 *
 * Passando de 6 categorias, o excedente vira "Outros" em cinza. Gerar uma
 * sétima cor produziria um tom indistinguível sob daltonismo.
 */
export default function MonthlySpendChart({ data }: { data: MonthlyPoint[] }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);

  const { months, cats, matrix, totals, order } = useMemo(() => {
    const months = [...new Set(data.map((d) => d.purchase_month))].sort();

    const byCat = new Map<string, number>();
    for (const d of data) byCat.set(d.category, (byCat.get(d.category) ?? 0) + d.spent_cents);

    const ranked = [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
    const keep = ranked.slice(0, MAX_SERIES - (ranked.length > MAX_SERIES ? 1 : 0));
    const cats = ranked.length > MAX_SERIES ? [...keep, 'Outras'] : keep;

    const matrix = new Map<string, Map<string, number>>();
    for (const m of months) matrix.set(m, new Map(cats.map((c) => [c, 0])));
    for (const d of data) {
      const c = cats.includes(d.category) ? d.category : 'Outras';
      const row = matrix.get(d.purchase_month)!;
      row.set(c, (row.get(c) ?? 0) + d.spent_cents);
    }

    const totals = new Map(months.map((m) => [m, [...matrix.get(m)!.values()].reduce((a, b) => a + b, 0)]));
    return { months, cats, matrix, totals, order: cats };
  }, [data]);

  const table = (
    <table>
      <caption className="sr-only">Gasto por mês e categoria</caption>
      <thead>
        <tr>
          <th scope="col">Mês</th>
          {cats.map((c) => <th key={c} scope="col" className="num">{c}</th>)}
          <th scope="col" className="num">Total</th>
        </tr>
      </thead>
      <tbody>
        {months.map((m) => (
          <tr key={m}>
            <td>{monthLabel(m)}</td>
            {cats.map((c) => <td key={c} className="num">{formatBRL(matrix.get(m)!.get(c) ?? 0)}</td>)}
            <td className="num"><strong>{formatBRL(totals.get(m) ?? 0)}</strong></td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  if (months.length === 0) {
    return (
      <ChartCard title="Gasto por mês" table={table}>
        <EmptyChart>Confirme uma nota para começar a ver o gasto mensal.</EmptyChart>
      </ChartCard>
    );
  }

  const maxTotal = Math.max(...totals.values());
  const ticks = niceTicks(0, maxTotal, 4);
  const domain = Math.max(...ticks, maxTotal) || 1;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const plotW = Math.max(width - PAD.left - PAD.right, 60);
  const colW = plotW / months.length;
  const barW = Math.min(colW * 0.62, 56);

  const colorOf = (c: string) =>
    c === 'Outras' ? 'var(--border-strong)' : SERIES_VARS[Math.min(order.indexOf(c), MAX_SERIES - 1)];

  return (
    <ChartCard
      title="Gasto por mês"
      note="Quanto saiu do bolso a cada mês, dividido por categoria."
      legend={<Legend items={cats.map((c) => ({ key: c, label: c, color: colorOf(c) }))} />}
      table={table}
    >
      <div ref={box} style={{ position: 'relative', width: '100%' }}>
        <svg width="100%" height={HEIGHT} role="img" aria-label="Gasto mensal empilhado por categoria">
          {ticks.map((t) => {
            const y = PAD.top + innerH - (t / domain) * innerH;
            return (
              <g key={t}>
                <line x1={PAD.left} x2={PAD.left + plotW} y1={y} y2={y} stroke="var(--grid)" strokeWidth={1} />
                <text x={PAD.left - 8} y={y} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--text-muted)"
                      style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatBRL(t)}
                </text>
              </g>
            );
          })}

          {months.map((m, i) => {
            const row = matrix.get(m)!;
            const cx = PAD.left + colW * (i + 0.5);
            const bx = cx - barW / 2;
            let acc = 0;

            // Rótulo do mês só quando cabe — melhor pular do que colidir.
            const everyN = Math.ceil((months.length * 44) / Math.max(plotW, 1));
            const showLabel = months.length <= 12 || i % everyN === 0 || i === months.length - 1;

            return (
              <g key={m} onMouseEnter={() => setHover(m)} onMouseLeave={() => setHover(null)}
                 onFocus={() => setHover(m)} onBlur={() => setHover(null)} tabIndex={0}
                 aria-label={`${monthLabel(m)}: ${formatBRL(totals.get(m) ?? 0)}`}>
                <rect x={PAD.left + colW * i} y={PAD.top} width={colW} height={innerH}
                      fill={hover === m ? 'var(--surface-2)' : 'transparent'} style={{ cursor: 'default' }} />
                {cats.map((c) => {
                  const v = row.get(c) ?? 0;
                  if (v <= 0) return null;
                  const h = (v / domain) * innerH;
                  const y = PAD.top + innerH - ((acc + v) / domain) * innerH;
                  acc += v;
                  // GAP de superfície entre segmentos — nunca uma borda desenhada.
                  return <rect key={c} x={bx} y={y} width={barW} height={Math.max(h - GAP, 1)} rx={2} fill={colorOf(c)} />;
                })}
                {showLabel && (
                  <text x={cx} y={HEIGHT - 9} textAnchor="middle" fontSize={11} fill="var(--text-muted)">
                    {monthLabel(m)}
                  </text>
                )}
              </g>
            );
          })}

          <line x1={PAD.left} x2={PAD.left + plotW} y1={PAD.top + innerH} y2={PAD.top + innerH}
                stroke="var(--border-strong)" strokeWidth={1} />
        </svg>

        {hover && (
          <HoverCard month={hover} cats={cats} row={matrix.get(hover)!} total={totals.get(hover) ?? 0} colorOf={colorOf} />
        )}
      </div>
    </ChartCard>
  );
}

function HoverCard({ month, cats, row, total, colorOf }: {
  month: string; cats: string[]; row: Map<string, number>; total: number; colorOf: (c: string) => string;
}) {
  return (
    <div role="tooltip" style={{
      position: 'absolute', right: 8, top: 8, width: 200,
      background: 'var(--surface-1)', border: '1px solid var(--border-strong)', borderRadius: 8,
      boxShadow: 'var(--shadow)', padding: '8px 10px', fontSize: 12.5, pointerEvents: 'none', zIndex: 5,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{monthLabel(month)}</div>
      {cats.filter((c) => (row.get(c) ?? 0) > 0).map((c) => (
        <div key={c} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ display: 'flex', gap: 5, alignItems: 'center', minWidth: 0 }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: colorOf(c), flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c}</span>
          </span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatBRL(row.get(c) ?? 0)}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, paddingTop: 5,
                    borderTop: '1px solid var(--border)', fontWeight: 600 }}>
        <span>Total</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatBRL(total)}</span>
      </div>
    </div>
  );
}
