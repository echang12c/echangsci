import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProduct, getPriceHistory, getMarketComparison } from '@/lib/queries';
import { filtersFromParams } from '@/lib/filters';
import { formatBRL } from '@/lib/money';
import ProductCharts from '@/components/ProductCharts';

export const dynamic = 'force-dynamic';

export default async function ProdutoPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const productId = Number(id);
  const product = getProduct(productId);
  if (!product) notFound();

  const filters = filtersFromParams(sp);
  const points = getPriceHistory(productId, filters);
  const stats = getMarketComparison(productId);

  // Ordem estável dos mercados = cor estável. Se a cor seguisse a posição na
  // lista filtrada, filtrar repintaria os sobreviventes e enganaria quem já
  // tinha aprendido "o Assaí é o azul".
  const marketOrder = [...stats]
    .sort((a, b) => a.market_id - b.market_id)
    .map((s) => s.market_name);

  const canShowKilo = points.some((p) => p.price_per_kg_cents != null);
  const cheapest = stats[0];
  const priciest = stats[stats.length - 1];
  const totalSpent = points.reduce((a, p) => a + p.total_cents, 0);
  const lastPoint = points[points.length - 1];

  return (
    <>
      <p className="page-sub" style={{ margin: '20px 0 0' }}>
        <Link href="/mercado/produtos" className="muted">← Produtos</Link>
      </p>
      <h1 style={{ marginTop: 6 }}>{product.name}</h1>
      <p className="page-sub">
        {[product.brand, product.category,
          product.pack_size ? `embalagem de ${product.pack_size}${product.pack_unit}` : 'a granel']
          .filter(Boolean).join(' · ')}
      </p>

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">Último preço</div>
          <div className="kpi-value">{lastPoint ? formatBRL(lastPoint.net_unit_price_cents) : '—'}</div>
          <div className="kpi-hint">
            {lastPoint ? `${lastPoint.market_name} · ${lastPoint.purchase_date.split('-').reverse().join('/')}` : 'sem compras'}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Mais barato em</div>
          <div className="kpi-value" style={{ fontSize: 20 }}>{cheapest ? cheapest.market_name : '—'}</div>
          <div className="kpi-hint">{cheapest ? `${formatBRL(cheapest.avg_unit_price_cents)} em média` : ''}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Economia por unidade</div>
          <div className="kpi-value" style={{ color: 'var(--good)' }}>
            {cheapest && priciest && priciest !== cheapest
              ? formatBRL(priciest.avg_unit_price_cents - cheapest.avg_unit_price_cents)
              : '—'}
          </div>
          <div className="kpi-hint">
            {priciest && cheapest && priciest !== cheapest ? `trocando ${priciest.market_name} pelo ${cheapest.market_name}` : 'comprado em um mercado só'}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Total gasto</div>
          <div className="kpi-value">{formatBRL(totalSpent)}</div>
          <div className="kpi-hint">{points.length} compra{points.length === 1 ? '' : 's'} no período</div>
        </div>
      </div>

      <ProductCharts points={points} stats={stats} marketOrder={marketOrder} canShowKilo={canShowKilo} />
    </>
  );
}
