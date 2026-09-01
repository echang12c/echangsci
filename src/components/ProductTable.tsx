'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatBRL } from '@/lib/money';
import type { ProductRow } from '@/lib/queries';

type SortKey = 'spent_cents' | 'last_price_cents' | 'variation' | 'purchases' | 'product_name';

const variation = (p: ProductRow) =>
  p.min_price_cents > 0 ? ((p.max_price_cents - p.min_price_cents) / p.min_price_cents) * 100 : 0;

export default function ProductTable({ rows }: { rows: ProductRow[] }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('spent_cents');

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? rows.filter((r) =>
          `${r.product_name} ${r.brand ?? ''} ${r.category}`.toLowerCase().includes(needle))
      : rows;
    return [...filtered].sort((a, b) =>
      sort === 'product_name' ? a.product_name.localeCompare(b.product_name)
      : sort === 'variation' ? variation(b) - variation(a)
      : (b[sort] as number) - (a[sort] as number));
  }, [rows, q, sort]);

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input type="search" placeholder="Buscar produto…" value={q} onChange={(e) => setQ(e.target.value)}
               aria-label="Buscar produto" style={{ flex: '1 1 200px' }} />
        <label htmlFor="ord" className="sr-only">Ordenar por</label>
        <select id="ord" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="spent_cents">Mais gasto</option>
          <option value="variation">Maior variação</option>
          <option value="last_price_cents">Preço mais alto</option>
          <option value="purchases">Mais comprado</option>
          <option value="product_name">Nome (A–Z)</option>
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Produto</th>
              <th scope="col">Categoria</th>
              <th scope="col" className="num">Compras</th>
              <th scope="col" className="num">Mercados</th>
              <th scope="col" className="num">Último preço</th>
              <th scope="col" className="num">Menor</th>
              <th scope="col" className="num">Maior</th>
              <th scope="col" className="num">Variação</th>
              <th scope="col" className="num">Valor do kilo</th>
              <th scope="col" className="num">Total gasto</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const v = variation(p);
              return (
                <tr key={p.product_id}>
                  <td>
                    <Link href={`/mercado/produto/${p.product_id}`} style={{ fontWeight: 550 }}>
                      {p.product_name}
                    </Link>
                    {p.brand && <div className="muted" style={{ fontSize: 12.5 }}>{p.brand}</div>}
                  </td>
                  <td><span className="chip">{p.category}</span></td>
                  <td className="num">{p.purchases}</td>
                  <td className="num">{p.markets}</td>
                  <td className="num">{formatBRL(p.last_price_cents)}</td>
                  <td className="num">{formatBRL(p.min_price_cents)}</td>
                  <td className="num">{formatBRL(p.max_price_cents)}</td>
                  <td className="num">
                    {v > 0.5
                      ? <span className={`chip ${v >= 20 ? 'chip-crit' : v >= 8 ? 'chip-warn' : ''}`}>{v.toFixed(0)}%</span>
                      : <span className="muted">—</span>}
                  </td>
                  <td className="num">
                    {p.avg_price_per_kg_cents ? formatBRL(Math.round(p.avg_price_per_kg_cents)) : <span className="muted">—</span>}
                  </td>
                  <td className="num">{formatBRL(p.spent_cents)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {shown.length === 0 && <p className="muted" style={{ textAlign: 'center', padding: 24 }}>Nenhum produto com esse nome.</p>}
    </>
  );
}
