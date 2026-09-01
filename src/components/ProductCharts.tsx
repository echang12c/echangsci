'use client';

import { useState } from 'react';
import PriceLineChart, { type Metric } from './charts/PriceLineChart';
import MarketBarChart from './charts/MarketBarChart';
import type { PricePoint, MarketStat } from '@/lib/queries';

/**
 * Os dois gráficos do produto compartilham UM controle de métrica.
 * Se cada cartão tivesse o seu, o leitor poderia comparar valor unitário com
 * valor do kilo sem perceber.
 */
export default function ProductCharts({
  points, stats, marketOrder, canShowKilo,
}: {
  points: PricePoint[];
  stats: MarketStat[];
  marketOrder: string[];
  canShowKilo: boolean;
}) {
  const [metric, setMetric] = useState<Metric>('unitario');

  return (
    <>
      {canShowKilo && (
        <div className="filters">
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 550 }}>Comparar por</span>
          <div role="group" aria-label="Métrica de preço" style={{ display: 'flex', gap: 2 }}>
            {([['unitario', 'Valor unitário'], ['kilo', 'Valor do kilo']] as const).map(([v, label]) => (
              <button key={v} type="button" className={`btn btn-sm ${metric === v ? '' : 'btn-ghost'}`}
                      aria-pressed={metric === v} onClick={() => setMetric(v)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid-2">
        <PriceLineChart points={points} metric={metric} marketOrder={marketOrder} />
        <MarketBarChart stats={stats} />
      </div>
    </>
  );
}
