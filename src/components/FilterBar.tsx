'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';

/**
 * UMA linha de filtros acima de tudo que ela filtra.
 * Filtro dentro do cartão de gráfico é anti-padrão: dois gráficos lado a lado
 * passariam a mostrar fatias diferentes sem o leitor perceber.
 */
export default function FilterBar({
  markets, categories, extra,
}: {
  markets: { id: number; name: string }[];
  categories: string[];
  extra?: React.ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="filters">
      {/* Cada par rótulo+campo é uma unidade: soltos, eles quebram de linha
          separados e o rótulo fica órfão sobre o campo errado no celular. */}
      <div className="filter-field">
        <label htmlFor="f-periodo">Período</label>
        <select id="f-periodo" value={params.get('meses') ?? '12'} onChange={(e) => set('meses', e.target.value)}>
          <option value="3">3 meses</option>
          <option value="6">6 meses</option>
          <option value="12">12 meses</option>
          <option value="0">Tudo</option>
        </select>
      </div>

      <div className="filter-field">
        <label htmlFor="f-mercado">Mercado</label>
        <select id="f-mercado" value={params.get('mercado') ?? ''} onChange={(e) => set('mercado', e.target.value)}>
          <option value="">Todos</option>
          {markets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      <div className="filter-field">
        <label htmlFor="f-categoria">Categoria</label>
        <select id="f-categoria" value={params.get('categoria') ?? ''} onChange={(e) => set('categoria', e.target.value)}>
          <option value="">Todas</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {extra}
    </div>
  );
}
