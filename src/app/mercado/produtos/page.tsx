import Link from 'next/link';
import { Suspense } from 'react';
import { getProducts, getMarkets, getCategories } from '@/lib/queries';
import { filtersFromParams } from '@/lib/filters';
import { formatBRL } from '@/lib/money';
import FilterBar from '@/components/FilterBar';
import ProductTable from '@/components/ProductTable';

export const dynamic = 'force-dynamic';

export default async function ProdutosPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const filters = filtersFromParams(sp);
  const products = getProducts(filters);
  const markets = getMarkets();
  const categories = getCategories();

  return (
    <>
      <h1>Produtos</h1>
      <p className="page-sub">
        Cada produto que você compra, quanto custou da última vez e quanto o preço já variou.
      </p>

      <Suspense fallback={<div className="filters" style={{ height: 48 }} />}>
        <FilterBar markets={markets} categories={categories} />
      </Suspense>

      {products.length === 0 ? (
        <div className="card">
          <div className="empty">
            <h3>Nada neste filtro</h3>
            <p>Nenhuma compra confirmada bate com o período, mercado ou categoria selecionados.</p>
            <Link href="/mercado/nova" className="btn btn-primary">Adicionar nota</Link>
          </div>
        </div>
      ) : (
        <section className="card">
          <div className="card-head" style={{ justifyContent: 'space-between' }}>
            <h2>{products.length} produto{products.length === 1 ? '' : 's'}</h2>
            <span className="muted" style={{ fontSize: 13 }}>
              total {formatBRL(products.reduce((a, p) => a + p.spent_cents, 0))}
            </span>
          </div>
          <p className="card-note">
            &ldquo;Variação&rdquo; é a diferença entre o menor e o maior preço unitário que você já pagou
            por este produto no período — em qualquer mercado.
          </p>
          <ProductTable rows={products} />
        </section>
      )}
    </>
  );
}
