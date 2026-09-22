'use client';

import { useMemo, useState } from 'react';
import { formatBRL } from '@/lib/money';
import { ChartCard, EmptyChart, Tooltip, niceTicks, monthLabel, useWidth } from './shared';
import type { HouseMonthlyPoint } from '@/lib/house';

const PAD = { top: 16, right: 16, bottom: 30, left: 64 };
const HEIGHT = 260;

/**
 * Uma linha só: o total das contas somadas mês a mês, ou de uma conta
 * específica quando o filtro escolhe uma. Ao contrário do preço de produto
 * (PriceLineChart), aqui é gasto acumulado do mês — a escala força o zero,
 * como em qualquer soma de dinheiro.
 */
export default function HouseBillsLineChart({
  data, title, note,
}: { data: HouseMonthlyPoint[]; title: string; note?: string }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const months = useMemo(() => [...data].sort((a, b) => a.month.localeCompare(b.month)), [data]);

  const table = (
    <table>
      <caption className="sr-only">{title} por mês</caption>
      <thead>
        <tr>
          <th scope="col">Mês</th>
          <th scope="col" className="num">Valor</th>
        </tr>
      </thead>
      <tbody>
        {months.map((m) => (
          <tr key={m.month}>
            <td>{monthLabel(m.month)}</td>
            <td className="num">{formatBRL(m.amount_cents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  if (months.length === 0) {
    return (
      <ChartCard title={title} note={note} table={table}>
        <EmptyChart>Marque alguma conta como paga para começar a ver o histórico mensal.</EmptyChart>
      </ChartCard>
    );
  }

  const values = months.map((m) => m.amount_cents);
  const maxValue = Math.max(...values);
  const ticks = niceTicks(0, maxValue, 4);
  const domain = Math.max(...ticks, maxValue) || 1;

  const innerW = Math.max(width - PAD.left - PAD.right, 80);
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  const sx = (i: number) => PAD.left + (months.length === 1 ? innerW / 2 : (i / (months.length - 1)) * innerW);
  const sy = (v: number) => PAD.top + innerH - (v / domain) * innerH;

  const path = months.map((m, i) => `${i ? 'L' : 'M'}${sx(i)},${sy(m.amount_cents)}`).join(' ');
  const hoverPoint = hover != null ? months[hover] : null;

  return (
    <ChartCard title={title} note={note} table={table}>
      <div ref={box} style={{ position: 'relative', width: '100%' }}>
        <svg width="100%" height={HEIGHT} role="img" aria-label={`${title}, uma linha por mês`}
             onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + innerW} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" strokeWidth={1} />
              <text x={PAD.left - 8} y={sy(t)} dy="0.32em" textAnchor="end"
                    fontSize={11} fill="var(--text-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatBRL(t)}
              </text>
            </g>
          ))}

          {months.map((m, i) => {
            const only = months.length <= 8 || i === 0 || i === months.length - 1
              || i % Math.ceil(months.length / 6) === 0;
            return only ? (
              <text key={m.month} x={sx(i)} y={HEIGHT - 10} textAnchor="middle" fontSize={11} fill="var(--text-muted)">
                {monthLabel(m.month)}
              </text>
            ) : null;
          })}

          {hoverPoint && (
            <line x1={sx(hover!)} x2={sx(hover!)} y1={PAD.top} y2={PAD.top + innerH}
                  stroke="var(--border-strong)" strokeWidth={1} />
          )}

          <path d={path} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {months.map((m, i) => (
            <circle key={m.month} cx={sx(i)} cy={sy(m.amount_cents)} r={4.5}
                    fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth={2} />
          ))}

          {/* faixas de acerto largas: o alvo é a coluna do mês, não o ponto de 9px */}
          {months.map((m, i) => {
            const w = innerW / Math.max(months.length, 1);
            return (
              <rect key={m.month} x={sx(i) - w / 2} y={PAD.top} width={Math.max(w, 24)} height={innerH}
                    fill="transparent" style={{ cursor: 'crosshair' }}
                    onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}
                    aria-label={`${monthLabel(m.month)}: ${formatBRL(m.amount_cents)}`} />
            );
          })}
        </svg>

        {hoverPoint && (
          <Tooltip x={sx(hover!)} y={PAD.top + innerH / 2} width={width}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{monthLabel(hoverPoint.month)}</div>
            <div style={{ fontVariantNumeric: 'tabular-nums' }}>{formatBRL(hoverPoint.amount_cents)}</div>
          </Tooltip>
        )}
      </div>
    </ChartCard>
  );
}
