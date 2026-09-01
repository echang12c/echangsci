import Link from 'next/link';
import { Suspense } from 'react';
import { getKpis, getMonthlySpend, getSpreads, getMarkets, getCategories, getReceipts } from '@/lib/queries';
import { filtersFromParams } from '@/lib/filters';
import { formatBRL } from '@/lib/money';
import FilterBar from '@/components/FilterBar';
import MonthlySpendChart from '@/components/charts/MonthlySpendChart';

export const dynamic = 'force-dynamic';

export default async function MercadoPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const filters = filtersFromParams(sp);

  const [kpis, monthly, spreads, markets, categories, receipts] = [
    getKpis(filters), getMonthlySpend(filters), getSpreads(8),
    getMarkets(), getCategories(), getReceipts(5),
  ];

  if (receipts.length === 0) {
    return (
      <>
        <h1>Mercado</h1>
        <p className="page-sub">Fotografe a nota fiscal e o Cofrin monta o histórico de preço de cada produto.</p>
        <div className="card">
          <div className="empty">
            <h3>Nenhuma nota ainda</h3>
            <p>
              Tire uma foto do cupom fiscal do supermercado. O Cofrin lê os itens, a quantidade,
              o valor unitário e o desconto — e passa a acompanhar quanto cada produto custa em cada mercado.
            </p>
            <Link href="/mercado/nova" className="btn btn-primary">Adicionar primeira nota</Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Mercado</h1>
      <p className="page-sub">Quanto você gasta, com o quê, e onde sai mais barato.</p>

      <Suspense fallback={<div className="filters" style={{ height: 48 }} />}>
        <FilterBar markets={markets} categories={categories} />
      </Suspense>

      {/* Fileira de KPI: números-manchete não viram gráfico de barra de um item. */}
      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">Gasto</div>
          <div className="kpi-value">{formatBRL(kpis.spent_cents)}</div>
          <div className="kpi-hint">{kpis.receipt_count} nota{kpis.receipt_count === 1 ? '' : 's'} no período</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Descontos</div>
          <div className="kpi-value" style={{ color: 'var(--good)' }}>{formatBRL(kpis.saved_cents)}</div>
          <div className="kpi-hint">o que a promoção já tirou da conta</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Ticket médio</div>
          <div className="kpi-value">{formatBRL(kpis.avg_ticket_cents)}</div>
          <div className="kpi-hint">por ida ao mercado</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Itens</div>
          <div className="kpi-value">{kpis.item_count}</div>
          <div className="kpi-hint">linhas de nota registradas</div>
        </div>
      </div>

      <MonthlySpendChart data={monthly} />

      {spreads.length > 0 && (
        <section className="card">
          <div className="card-head"><h2>Onde você paga mais caro</h2></div>
          <p className="card-note">
            Produtos que você comprou em mais de um mercado. A economia é por unidade,
            comparando o preço médio do mercado mais caro com o do mais barato.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Produto</th>
                  <th scope="col">Mais barato</th>
                  <th scope="col" className="num">Preço</th>
                  <th scope="col">Mais caro</th>
                  <th scope="col" className="num">Preço</th>
                  <th scope="col" className="num">Economia</th>
                </tr>
              </thead>
              <tbody>
                {spreads.map((s) => (
                  <tr key={s.product_id}>
                    <td>
                      <Link href={`/mercado/produto/${s.product_id}`} style={{ fontWeight: 550 }}>
                        {s.product_name}
                      </Link>
                      {s.brand && <span className="muted"> · {s.brand}</span>}
                    </td>
                    <td>{s.cheapest_market}</td>
                    <td className="num">{formatBRL(s.cheapest_cents)}</td>
                    <td>{s.priciest_market}</td>
                    <td className="num">{formatBRL(s.priciest_cents)}</td>
                    <td className="num">
                      <span className="chip chip-good">
                        {formatBRL(s.savings_cents)} · {s.spread_pct.toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-head" style={{ justifyContent: 'space-between' }}>
          <h2>Últimas notas</h2>
          <Link href="/mercado/notas" className="btn btn-sm btn-ghost">Ver todas</Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Data</th><th scope="col">Mercado</th>
                <th scope="col" className="num">Itens</th><th scope="col" className="num">Total</th>
                <th scope="col">Situação</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/mercado/nota/${r.id}`}>{r.purchase_date.split('-').reverse().join('/')}</Link></td>
                  <td>{r.market_name}</td>
                  <td className="num">{r.item_count}</td>
                  <td className="num">{formatBRL(r.total_cents)}</td>
                  <td>
                    <span className={`chip ${r.status === 'confirmada' ? 'chip-good' : 'chip-warn'}`}>
                      {r.status === 'confirmada' ? 'confirmada' : 'conferir'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
