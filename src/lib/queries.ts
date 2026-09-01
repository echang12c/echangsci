import { db } from './db';

/** Filtro único da seção — uma linha de filtros acima de todos os gráficos. */
export interface Filters {
  months: number | null; // null = tudo
  marketId: number | null;
  category: string | null;
}

export const DEFAULT_FILTERS: Filters = { months: 12, marketId: null, category: null };

function since(months: number | null): string {
  if (!months) return '0000-01-01';
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

/** Cláusula WHERE compartilhada, para que todo gráfico enxergue a MESMA fatia. */
function scope(f: Filters) {
  const clauses = ['purchase_date >= @from'];
  const params: Record<string, unknown> = { from: since(f.months) };
  if (f.marketId) { clauses.push('market_id = @marketId'); params.marketId = f.marketId; }
  if (f.category) { clauses.push('category = @category'); params.category = f.category; }
  return { where: clauses.join(' AND '), params };
}

// ---------------------------------------------------------------------------

export interface Kpis {
  spent_cents: number;
  saved_cents: number;
  item_count: number;
  receipt_count: number;
  avg_ticket_cents: number;
  best_saving: { product_name: string; savings_cents: number; cheapest_market: string } | null;
}

export function getKpis(f: Filters): Kpis {
  const { where, params } = scope(f);
  const row = db()
    .prepare(
      `SELECT COALESCE(SUM(total_cents),0)     AS spent_cents,
              COALESCE(SUM(discount_cents),0)  AS saved_cents,
              COUNT(*)                          AS item_count,
              COUNT(DISTINCT receipt_id)        AS receipt_count
         FROM v_items WHERE ${where}`,
    )
    .get(params) as Omit<Kpis, 'avg_ticket_cents' | 'best_saving'>;

  const best = db()
    .prepare(
      `SELECT product_name, savings_cents, cheapest_market
         FROM v_product_spread ORDER BY savings_cents DESC LIMIT 1`,
    )
    .get() as Kpis['best_saving'];

  return {
    ...row,
    avg_ticket_cents: row.receipt_count ? Math.round(row.spent_cents / row.receipt_count) : 0,
    best_saving: best ?? null,
  };
}

// ---------------------------------------------------------------------------

export interface ProductRow {
  product_id: number;
  product_name: string;
  brand: string | null;
  category: string;
  purchases: number;
  markets: number;
  last_price_cents: number;
  min_price_cents: number;
  max_price_cents: number;
  avg_price_per_kg_cents: number | null;
  spent_cents: number;
  last_purchase: string;
}

/** A tabela principal: cada produto que você compra e como o preço se move. */
export function getProducts(f: Filters): ProductRow[] {
  const { where, params } = scope(f);
  return db()
    .prepare(
      // `scoped` aplica o filtro UMA vez; `latest` pega o preço da compra mais
      // recente DENTRO da fatia filtrada — se pegasse fora, o "último preço"
      // contradiria o gráfico ao lado.
      `WITH scoped AS (
          SELECT * FROM v_price_history WHERE ${where}
       ),
       latest AS (
          SELECT product_id, net_unit_price_cents AS last_price_cents,
                 ROW_NUMBER() OVER (PARTITION BY product_id
                                    ORDER BY purchase_date DESC, market_id) AS rn
            FROM scoped
       )
       SELECT s.product_id,
              s.product_name,
              s.brand,
              s.category,
              COUNT(*)                          AS purchases,
              COUNT(DISTINCT s.market_id)       AS markets,
              MIN(s.net_unit_price_cents)       AS min_price_cents,
              MAX(s.net_unit_price_cents)       AS max_price_cents,
              AVG(s.price_per_kg_cents)         AS avg_price_per_kg_cents,
              SUM(s.total_cents)                AS spent_cents,
              MAX(s.purchase_date)              AS last_purchase,
              l.last_price_cents
         FROM scoped s
         JOIN latest l ON l.product_id = s.product_id AND l.rn = 1
        GROUP BY s.product_id
        ORDER BY spent_cents DESC`,
    )
    .all(params) as ProductRow[];
}

// ---------------------------------------------------------------------------

export interface PricePoint {
  purchase_date: string;
  market_id: number;
  market_name: string;
  net_unit_price_cents: number;
  price_per_kg_cents: number | null;
  quantity: number;
  unit: string;
  discount_cents: number;
  total_cents: number;
}

/** Série temporal de um produto — o gráfico de linhas, uma linha por mercado. */
export function getPriceHistory(productId: number, f: Filters): PricePoint[] {
  return db()
    .prepare(
      `SELECT purchase_date, market_id, market_name, net_unit_price_cents,
              price_per_kg_cents, quantity, unit, discount_cents, total_cents
         FROM v_price_history
        WHERE product_id = @pid AND purchase_date >= @from
        ORDER BY purchase_date`,
    )
    .all({ pid: productId, from: since(f.months) }) as PricePoint[];
}

export interface MarketStat {
  market_id: number;
  market_name: string;
  purchases: number;
  avg_unit_price_cents: number;
  min_unit_price_cents: number;
  max_unit_price_cents: number;
  last_purchase: string;
}

/** Comparação do MESMO produto entre mercados — o gráfico de barras. */
export function getMarketComparison(productId: number): MarketStat[] {
  return db()
    .prepare(
      `SELECT market_id, market_name, purchases, avg_unit_price_cents,
              min_unit_price_cents, max_unit_price_cents, last_purchase
         FROM v_product_market_stats
        WHERE product_id = ?
        ORDER BY avg_unit_price_cents`,
    )
    .all(productId) as MarketStat[];
}

export function getProduct(productId: number) {
  return db().prepare('SELECT * FROM products WHERE id = ?').get(productId) as
    | { id: number; name: string; brand: string | null; category: string; pack_size: number | null; pack_unit: string | null }
    | undefined;
}

// ---------------------------------------------------------------------------

export interface SpreadRow {
  product_id: number;
  product_name: string;
  brand: string | null;
  cheapest_market: string;
  priciest_market: string;
  cheapest_cents: number;
  priciest_cents: number;
  savings_cents: number;
  spread_pct: number;
  purchases: number;
}

/** "Onde eu estou perdendo dinheiro" — ordenado pela economia por unidade. */
export function getSpreads(limit = 12): SpreadRow[] {
  return db()
    .prepare(`SELECT * FROM v_product_spread ORDER BY savings_cents DESC LIMIT ?`)
    .all(limit) as SpreadRow[];
}

export interface MonthlyPoint { purchase_month: string; category: string; spent_cents: number }

export function getMonthlySpend(f: Filters): MonthlyPoint[] {
  const { where, params } = scope(f);
  return db()
    .prepare(
      `SELECT purchase_month, category, SUM(total_cents) AS spent_cents
         FROM v_items WHERE ${where}
        GROUP BY purchase_month, category
        ORDER BY purchase_month`,
    )
    .all(params) as MonthlyPoint[];
}

export function getMarkets() {
  return db()
    .prepare(
      `SELECT m.id, m.name, m.chain,
              COUNT(DISTINCT r.id) AS receipts,
              COALESCE(SUM(r.total_cents),0) AS spent_cents
         FROM markets m
         LEFT JOIN receipts r ON r.market_id = m.id AND r.status='confirmada'
        GROUP BY m.id ORDER BY spent_cents DESC`,
    )
    .all() as { id: number; name: string; chain: string | null; receipts: number; spent_cents: number }[];
}

export function getCategories(): string[] {
  return (db().prepare(`SELECT DISTINCT category FROM v_items ORDER BY category`).all() as { category: string }[])
    .map((r) => r.category);
}

export function getReceipts(limit = 50) {
  return db()
    .prepare(
      // Rascunho ainda não tem total fechado; mostrar 0 seria enganoso, então
      // cai para a soma das linhas já lidas da foto.
      `SELECT r.id, r.purchase_date, r.discount_cents, r.status, m.name AS market_name,
              COALESCE(NULLIF(r.total_cents, 0),
                       (SELECT COALESCE(SUM(ri.total_cents),0) FROM receipt_items ri WHERE ri.receipt_id = r.id)
                      ) AS total_cents,
              (SELECT COUNT(*) FROM receipt_items ri WHERE ri.receipt_id = r.id) AS item_count
         FROM receipts r JOIN markets m ON m.id = r.market_id
        ORDER BY r.purchase_date DESC, r.id DESC LIMIT ?`,
    )
    .all(limit) as {
      id: number; purchase_date: string; total_cents: number; discount_cents: number;
      status: string; market_name: string; item_count: number;
    }[];
}

export function getReceiptWithItems(id: number) {
  const conn = db();
  const receipt = conn
    .prepare(
      `SELECT r.*, m.name AS market_name FROM receipts r JOIN markets m ON m.id=r.market_id WHERE r.id=?`,
    )
    .get(id) as
    | { id: number; market_id: number; purchase_date: string; total_cents: number; discount_cents: number;
        status: string; market_name: string; image_path: string | null }
    | undefined;
  if (!receipt) return null;

  const items = conn
    .prepare(
      `SELECT ri.*, p.name AS product_name, p.brand, p.category, p.pack_size, p.pack_unit
         FROM receipt_items ri LEFT JOIN products p ON p.id = ri.product_id
        WHERE ri.receipt_id = ? ORDER BY ri.line_no`,
    )
    .all(id) as {
      id: number; product_id: number | null; line_no: number; raw_description: string;
      quantity: number; unit: string; unit_price_cents: number; discount_cents: number; total_cents: number;
      product_name: string | null; brand: string | null; category: string | null;
      pack_size: number | null; pack_unit: string | null;
    }[];

  return { receipt, items };
}
