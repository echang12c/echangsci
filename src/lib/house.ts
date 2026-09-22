import { db } from './db';

export interface HouseBill {
  id: number;
  name: string;
  category: string | null;
  default_amount_cents: number;
  created_at: string;
}

/** Uma conta já com o lançamento de um mês específico embutido (ou o palpite padrão, se ainda não houver). */
export interface HouseBillWithEntry extends HouseBill {
  amount_cents: number;
  paid: boolean;
  paid_at: string | null;
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Contas ativas, com o valor e a situação do mês informado — a lista da tela principal. */
export function getHouseBills(month: string): HouseBillWithEntry[] {
  const rows = db()
    .prepare(
      `SELECT b.id, b.name, b.category, b.default_amount_cents, b.created_at,
              COALESCE(e.amount_cents, b.default_amount_cents) AS amount_cents,
              COALESCE(e.paid, 0) AS paid,
              e.paid_at
         FROM house_bills b
         LEFT JOIN house_bill_entries e ON e.bill_id = b.id AND e.month = @month
        WHERE b.active = 1
        ORDER BY b.name COLLATE NOCASE`,
    )
    .all({ month }) as (HouseBill & { amount_cents: number; paid: number; paid_at: string | null })[];

  return rows.map((r) => ({ ...r, paid: Boolean(r.paid) }));
}

export function getHouseBillNames(): { id: number; name: string }[] {
  return db()
    .prepare(`SELECT id, name FROM house_bills WHERE active = 1 ORDER BY name COLLATE NOCASE`)
    .all() as { id: number; name: string }[];
}

export function createHouseBill(input: { name: string; category: string | null; default_amount_cents: number }): number {
  const name = input.name.trim();
  if (!name) throw new Error('Informe o nome da conta.');
  const info = db()
    .prepare(`INSERT INTO house_bills (name, category, default_amount_cents) VALUES (?,?,?)`)
    .run(name, input.category?.trim() || null, input.default_amount_cents);
  return Number(info.lastInsertRowid);
}

export function updateHouseBill(
  id: number,
  input: { name: string; category: string | null; default_amount_cents: number },
) {
  const name = input.name.trim();
  if (!name) throw new Error('Informe o nome da conta.');
  db()
    .prepare(`UPDATE house_bills SET name=?, category=?, default_amount_cents=? WHERE id=?`)
    .run(name, input.category?.trim() || null, input.default_amount_cents, id);
}

/** Some da lista, mas preserva o histórico (fica inativa em vez de apagada). */
export function deactivateHouseBill(id: number) {
  db().prepare(`UPDATE house_bills SET active = 0 WHERE id = ?`).run(id);
}

/** Cria ou atualiza o lançamento de uma conta num mês — a base do checklist e do gráfico. */
export function upsertHouseBillEntry(
  billId: number,
  month: string,
  input: { amount_cents: number; paid: boolean },
) {
  db()
    .prepare(
      `INSERT INTO house_bill_entries (bill_id, month, amount_cents, paid, paid_at)
       VALUES (@bill_id, @month, @amount_cents, @paid, @paid_at)
       ON CONFLICT(bill_id, month) DO UPDATE SET
         amount_cents = excluded.amount_cents,
         paid = excluded.paid,
         paid_at = excluded.paid_at`,
    )
    .run({
      bill_id: billId,
      month,
      amount_cents: input.amount_cents,
      paid: input.paid ? 1 : 0,
      paid_at: input.paid ? new Date().toISOString() : null,
    });
}

// ---------------------------------------------------------------------------

export interface HouseMonthlyPoint {
  month: string;
  amount_cents: number;
}

function since(months: number | null): string {
  if (!months) return '0000-01';
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 7);
}

export interface HouseFilters {
  months: number | null; // null = tudo
  billId: number | null; // null = todas juntas
}

export const DEFAULT_HOUSE_FILTERS: HouseFilters = { months: 12, billId: null };

export function houseFiltersFromParams(sp: Record<string, string | string[] | undefined>): HouseFilters {
  const get = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;
  const meses = get('meses');
  const conta = get('conta');
  return {
    months: meses === '0' ? null : Number(meses) || 12,
    billId: conta ? Number(conta) : null,
  };
}

/**
 * Série mensal para o gráfico: uma conta específica, ou a soma de todas
 * juntas quando nenhuma é escolhida. Só entram meses com lançamento — o
 * palpite padrão de um mês ainda não tocado não é gasto de verdade.
 */
export function getHouseMonthly(f: HouseFilters): HouseMonthlyPoint[] {
  const from = since(f.months);
  if (f.billId) {
    return db()
      .prepare(
        `SELECT month, amount_cents
           FROM house_bill_entries
          WHERE bill_id = @billId AND month >= @from
          ORDER BY month`,
      )
      .all({ billId: f.billId, from }) as HouseMonthlyPoint[];
  }
  return db()
    .prepare(
      `SELECT month, SUM(amount_cents) AS amount_cents
         FROM house_bill_entries
        WHERE month >= @from
        GROUP BY month
        ORDER BY month`,
    )
    .all({ from }) as HouseMonthlyPoint[];
}
