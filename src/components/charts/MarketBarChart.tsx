'use client';

import { useState } from 'react';
import { formatBRL } from '@/lib/money';
import { ChartCard, EmptyChart, niceTicks, useWidth } from './shared';
import type { MarketStat } from '@/lib/queries';

const ROW_H = 40;
const PAD = { top: 8, bottom: 8 };

/**
 * O mesmo produto, quanto custa em cada mercado.
 *
 * Forma: ênfase, não paleta categórica. A pergunta é "onde está mais barato" —
 * UM item é o ponto, os outros são contexto. Pintar cada mercado de uma cor
 * gastaria o canal de cor em informação que o comprimento da barra já dá, e
 * cairia no anti-padrão da rampa por valor sobre categoria nominal.
 */
export default function MarketBarChart({ stats }: { stats: MarketStat[] }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const table = (
    <table>
      <caption className="sr-only">Preço médio por mercado</caption>
      <thead>
        <tr>
          <th scope="col">Mercado</th><th scope="col" className="num">Compras</th>
          <th scope="col" className="num">Preço médio</th><th scope="col" className="num">Mín.</th>
          <th scope="col" className="num">Máx.</th><th scope="col">Última compra</th>
        </tr>
      </thead>
      <tbody>
        {stats.map((s) => (
          <tr key={s.market_id}>
            <td>{s.market_name}</td>
            <td className="num">{s.purchases}</td>
            <td className="num">{formatBRL(s.avg_unit_price_cents)}</td>
            <td className="num">{formatBRL(s.min_unit_price_cents)}</td>
            <td className="num">{formatBRL(s.max_unit_price_cents)}</td>
            <td>{s.last_purchase.split('-').reverse().join('/')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  if (stats.length === 0) {
    return (
      <ChartCard title="Comparação entre mercados" table={table}>
        <EmptyChart>Ainda não há compras confirmadas deste produto.</EmptyChart>
      </ChartCard>
    );
  }

  if (stats.length === 1) {
    // Uma barra só não é gráfico, é um número. (anti-padrão: bar chart de 1 barra)
    const s = stats[0];
    return (
      <ChartCard title="Comparação entre mercados"
                 note="Você só comprou este produto em um mercado até agora." table={table}>
        <div style={{ padding: '8px 0 4px' }}>
          <div className="kpi-label">{s.market_name}</div>
          <div className="kpi-value">{formatBRL(s.avg_unit_price_cents)}</div>
          <div className="kpi-hint">
            preço médio em {s.purchases} compra{s.purchases > 1 ? 's' : ''} · compre em outro mercado para comparar
          </div>
        </div>
      </ChartCard>
    );
  }

  const labelW = Math.min(Math.max(width * 0.28, 96), 168);
  const valueW = 78;                                  // faixa reservada ao rótulo direto
  const plotW = Math.max(width - labelW - valueW, 60);
  const height = stats.length * ROW_H + PAD.top + PAD.bottom;

  const cheapest = Math.min(...stats.map((s) => s.avg_unit_price_cents));
  const maxV = Math.max(...stats.map((s) => s.max_unit_price_cents));
  const ticks = niceTicks(0, maxV, 4);
  const domain = Math.max(...ticks, maxV) || 1;       // barra SEMPRE ancorada no zero
  const sx = (v: number) => (v / domain) * plotW;

  return (
    <ChartCard
      title="Comparação entre mercados"
      note="Preço médio pago em cada mercado. A linha fina mostra o mínimo e o máximo que você já pagou lá."
      table={table}
    >
      <div ref={box} style={{ width: '100%' }}>
        <svg width="100%" height={height} role="img"
             aria-label="Preço médio deste produto em cada mercado, do mais barato ao mais caro">
          {stats.map((s, i) => {
            const y = PAD.top + i * ROW_H;
            const isCheapest = s.avg_unit_price_cents === cheapest;
            const barH = 16;
            const by = y + (ROW_H - barH) / 2;
            const showRange = s.purchases > 1 && s.max_unit_price_cents > s.min_unit_price_cents;
            const labelX = labelW + Math.max(sx(s.avg_unit_price_cents),
                                             showRange ? sx(s.max_unit_price_cents) : 0) + 10;

            return (
              <g key={s.market_id}
                 onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                 onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                 tabIndex={0} role="listitem"
                 aria-label={`${s.market_name}: preço médio ${formatBRL(s.avg_unit_price_cents)} em ${s.purchases} compras`}>
                {/* alvo de hover: a linha inteira, bem acima do mínimo de 24px */}
                <rect x={0} y={y} width={Math.max(width, 0)} height={ROW_H} rx={6}
                      fill={hover === i ? 'var(--surface-2)' : 'transparent'} />

                <text x={4} y={y + ROW_H / 2} dy="0.32em" fontSize={13}
                      fill={isCheapest ? 'var(--text-primary)' : 'var(--text-secondary)'}
                      fontWeight={isCheapest ? 600 : 450}>
                  {s.market_name.length > 22 ? `${s.market_name.slice(0, 21)}…` : s.market_name}
                </text>

                {/* extremidade arredondada em 4px, ancorada na base */}
                <rect x={labelW} y={by} width={Math.max(sx(s.avg_unit_price_cents), 2)} height={barH} rx={4}
                      fill={isCheapest ? 'var(--series-1)' : 'var(--border-strong)'} />

                {showRange && (
                  <g stroke="var(--text-muted)" strokeWidth={1}>
                    <line x1={labelW + sx(s.min_unit_price_cents)} x2={labelW + sx(s.max_unit_price_cents)}
                          y1={by + barH / 2} y2={by + barH / 2} />
                    <line x1={labelW + sx(s.min_unit_price_cents)} x2={labelW + sx(s.min_unit_price_cents)}
                          y1={by + 3} y2={by + barH - 3} />
                    <line x1={labelW + sx(s.max_unit_price_cents)} x2={labelW + sx(s.max_unit_price_cents)}
                          y1={by + 3} y2={by + barH - 3} />
                  </g>
                )}

                {/* rótulo direto sempre FORA da barra: dentro seria cortado em barra curta */}
                <text x={labelX} y={by + barH / 2} dy="0.32em" fontSize={12.5} fontWeight={550}
                      fill="var(--text-primary)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatBRL(s.avg_unit_price_cents)}
                </text>
              </g>
            );
          })}

          <line x1={labelW} x2={labelW} y1={PAD.top} y2={PAD.top + stats.length * ROW_H}
                stroke="var(--border-strong)" strokeWidth={1} />
        </svg>

        <div style={{ display: 'flex', gap: 14, marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--series-1)' }} />
            mais barato
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden style={{ width: 14, height: 1, background: 'var(--text-muted)' }} />
            mín–máx pago
          </span>
        </div>
      </div>
    </ChartCard>
  );
}
