'use client';

import { useMemo, useState } from 'react';
import { formatBRL, formatQuantity } from '@/lib/money';
import { ChartCard, Legend, EmptyChart, Tooltip, colorForKey, niceTicks, shortDate, useWidth } from './shared';
import type { PricePoint } from '@/lib/queries';

export type Metric = 'unitario' | 'kilo';

const PAD = { top: 16, right: 76, bottom: 30, left: 56 };

/**
 * Preço de UM produto ao longo do tempo, uma linha por mercado.
 * Responde à pergunta "esse produto subiu, e onde ele é mais barato".
 *
 * Escala Y não força o zero: é linha de nível de preço, não barra. Forçar zero
 * achataria justamente a variação que o gráfico existe para mostrar.
 */
export default function PriceLineChart({
  points, metric, marketOrder,
}: { points: PricePoint[]; metric: Metric; marketOrder: string[] }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = 260;

  const value = (p: PricePoint) => (metric === 'kilo' ? p.price_per_kg_cents : p.net_unit_price_cents);
  const usable = useMemo(() => points.filter((p) => value(p) != null), [points, metric]);

  const series = useMemo(() => {
    const by = new Map<string, PricePoint[]>();
    for (const p of usable) {
      const k = p.market_name;
      if (!by.has(k)) by.set(k, []);
      by.get(k)!.push(p);
    }
    return [...by.entries()]
      .map(([name, pts]) => ({ name, pts: [...pts].sort((a, b) => a.purchase_date.localeCompare(b.purchase_date)) }))
      .sort((a, b) => marketOrder.indexOf(a.name) - marketOrder.indexOf(b.name));
  }, [usable, marketOrder]);

  const dates = useMemo(() => [...new Set(usable.map((p) => p.purchase_date))].sort(), [usable]);

  const label = metric === 'kilo' ? 'Valor do kilo' : 'Valor unitário';

  const table = (
    <table>
      <caption className="sr-only">{label} por data e mercado</caption>
      <thead>
        <tr>
          <th scope="col">Data</th><th scope="col">Mercado</th><th scope="col">Qtd.</th>
          <th scope="col" className="num">Unitário</th><th scope="col" className="num">Kilo</th>
          <th scope="col" className="num">Desconto</th><th scope="col" className="num">Total</th>
        </tr>
      </thead>
      <tbody>
        {points.map((p, i) => (
          <tr key={i}>
            <td>{p.purchase_date.split('-').reverse().join('/')}</td>
            <td>{p.market_name}</td>
            <td>{formatQuantity(p.quantity, p.unit)}</td>
            <td className="num">{formatBRL(p.net_unit_price_cents)}</td>
            <td className="num">{p.price_per_kg_cents ? formatBRL(p.price_per_kg_cents) : '—'}</td>
            <td className="num">{p.discount_cents ? formatBRL(p.discount_cents) : '—'}</td>
            <td className="num">{formatBRL(p.total_cents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  if (dates.length < 1) {
    return (
      <ChartCard title="Preço ao longo do tempo" table={table}>
        <EmptyChart>
          {metric === 'kilo'
            ? 'Este produto ainda não tem peso cadastrado, então não dá para calcular o valor do kilo.'
            : 'Ainda não há compras confirmadas deste produto.'}
        </EmptyChart>
      </ChartCard>
    );
  }

  const values = usable.map((p) => value(p) as number);
  const lo = Math.min(...values), hi = Math.max(...values);
  const padY = (hi - lo) * 0.18 || Math.max(hi * 0.1, 100);
  const ticks = niceTicks(lo - padY, hi + padY, 4);
  const yMin = Math.min(...ticks, lo), yMax = Math.max(...ticks, hi);

  const t0 = new Date(dates[0]).getTime();
  const t1 = new Date(dates[dates.length - 1]).getTime();
  const innerW = Math.max(width - PAD.left - PAD.right, 80);
  const innerH = height - PAD.top - PAD.bottom;

  const sx = (iso: string) =>
    PAD.left + (t1 === t0 ? innerW / 2 : ((new Date(iso).getTime() - t0) / (t1 - t0)) * innerW);
  const sy = (v: number) => PAD.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

  const legendItems = series.map((s) => ({ key: s.name, label: s.name, color: colorForKey(s.name, marketOrder) }));
  const hoverDate = hover != null ? dates[hover] : null;
  const hoverRows = hoverDate ? usable.filter((p) => p.purchase_date === hoverDate) : [];

  // Rótulo direto no fim de cada linha: obrigatório: no modo claro parte da
  // paleta fica abaixo de 3:1, então a cor sozinha não pode carregar a leitura.
  const endLabels = series.map((s) => {
    const last = s.pts[s.pts.length - 1];
    return { name: s.name, x: sx(last.purchase_date), y: sy(value(last) as number), v: value(last) as number };
  });
  // Empurra rótulos que se sobrepõem.
  endLabels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < endLabels.length; i++) {
    if (endLabels[i].y - endLabels[i - 1].y < 14) endLabels[i].y = endLabels[i - 1].y + 14;
  }

  return (
    <ChartCard
      title="Preço ao longo do tempo"
      note={`${label} em cada compra. Passe o dedo ou o mouse para ver a data.`}
      legend={<Legend items={legendItems} />}
      table={table}
    >
      <div ref={box} style={{ position: 'relative', width: '100%' }}>
        <svg
          width="100%" height={height} role="img"
          aria-label={`${label} deste produto ao longo do tempo, por mercado`}
          onMouseLeave={() => setHover(null)}
        >
          {/* grade: hairline sólida, um tom acima da superfície */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" strokeWidth={1} />
              <text x={PAD.left - 8} y={sy(t)} dy="0.32em" textAnchor="end"
                    fontSize={11} fill="var(--text-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatBRL(t)}
              </text>
            </g>
          ))}

          {dates.map((d, i) => {
            const only = dates.length <= 6 || i === 0 || i === dates.length - 1 || i % Math.ceil(dates.length / 5) === 0;
            return only ? (
              <text key={d} x={sx(d)} y={height - 10} textAnchor="middle" fontSize={11} fill="var(--text-muted)">
                {shortDate(d)}
              </text>
            ) : null;
          })}

          {hoverDate && (
            <line x1={sx(hoverDate)} x2={sx(hoverDate)} y1={PAD.top} y2={PAD.top + innerH}
                  stroke="var(--border-strong)" strokeWidth={1} />
          )}

          {series.map((s) => {
            const color = colorForKey(s.name, marketOrder);
            const d = s.pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.purchase_date)},${sy(value(p) as number)}`).join(' ');
            return (
              <g key={s.name}>
                <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                {s.pts.map((p, i) => (
                  <circle key={i} cx={sx(p.purchase_date)} cy={sy(value(p) as number)} r={4.5}
                          fill={color} stroke="var(--surface-1)" strokeWidth={2} />
                ))}
              </g>
            );
          })}

          {endLabels.map((l) => (
            <text key={l.name} x={width - PAD.right + 8} y={l.y} dy="0.32em"
                  fontSize={11.5} fill="var(--text-secondary)" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatBRL(l.v)}
            </text>
          ))}

          {/* faixas de acerto largas: o alvo é a coluna, não o ponto de 9px */}
          {dates.map((d, i) => {
            const w = innerW / Math.max(dates.length, 1);
            return (
              <rect key={d} x={sx(d) - w / 2} y={PAD.top} width={Math.max(w, 24)} height={innerH}
                    fill="transparent" style={{ cursor: 'crosshair' }}
                    onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}
                    aria-label={`${shortDate(d)}: ${hoverRows.map((r) => `${r.market_name} ${formatBRL(value(r) as number)}`).join(', ')}`} />
            );
          })}
        </svg>

        {hoverDate && hoverRows.length > 0 && (
          <Tooltip x={sx(hoverDate)} y={PAD.top + innerH / 2} width={width}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {hoverDate.split('-').reverse().join('/')}
            </div>
            {hoverRows.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', gap: 5, alignItems: 'center', minWidth: 0 }}>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                                             background: colorForKey(r.market_name, marketOrder) }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.market_name}</span>
                </span>
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatBRL(value(r) as number)}</strong>
              </div>
            ))}
          </Tooltip>
        )}
      </div>
    </ChartCard>
  );
}
