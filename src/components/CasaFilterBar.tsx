'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';

/** Filtro do gráfico de contas da casa: período e, opcionalmente, uma conta específica. */
export default function CasaFilterBar({ bills }: { bills: { id: number; name: string }[] }) {
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
      <div className="filter-field">
        <label htmlFor="f-periodo">Período</label>
        <select id="f-periodo" value={params.get('meses') ?? '12'} onChange={(e) => set('meses', e.target.value)}>
          <option value="6">6 meses</option>
          <option value="12">12 meses</option>
          <option value="24">24 meses</option>
          <option value="0">Tudo</option>
        </select>
      </div>

      <div className="filter-field">
        <label htmlFor="f-conta">Conta</label>
        <select id="f-conta" value={params.get('conta') ?? ''} onChange={(e) => set('conta', e.target.value)}>
          <option value="">Todas juntas</option>
          {bills.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
    </div>
  );
}
