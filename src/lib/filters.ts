import type { Filters } from './queries';

/** Lê a fatia atual da URL — assim o filtro é compartilhável e sobrevive ao refresh. */
export function filtersFromParams(sp: Record<string, string | string[] | undefined>): Filters {
  const get = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;
  const meses = get('meses');
  const mercado = get('mercado');
  const categoria = get('categoria');
  return {
    months: meses === '0' ? null : Number(meses) || 12,
    marketId: mercado ? Number(mercado) : null,
    category: categoria || null,
  };
}
