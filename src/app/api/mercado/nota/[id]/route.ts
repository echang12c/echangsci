import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { confirmReceipt, findOrCreateProduct, linkAlias } from '@/lib/repo';
import type { Unit } from '@/lib/types';

export const runtime = 'nodejs';

interface ItemPayload {
  id?: number;
  line_no: number;
  raw_description: string;
  quantity: number;
  unit: Unit;
  unit_price_cents: number;
  discount_cents: number;
  total_cents: number;
  product_id: number | null;
  /** Preenchido quando o usuário cria um produto novo na tela de conferência. */
  new_product?: { name: string; brand: string | null; category: string; pack_size: number | null; pack_unit: Unit | null };
}

interface SavePayload {
  purchase_date: string;
  discount_cents: number;
  items: ItemPayload[];
  confirmar?: boolean;
}

/** PUT — salva a conferência inteira de uma vez e, opcionalmente, confirma. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const receiptId = Number(id);

  try {
    const body = (await req.json()) as SavePayload;
    const conn = db();

    const receipt = conn.prepare('SELECT market_id, status FROM receipts WHERE id = ?').get(receiptId) as
      | { market_id: number; status: string } | undefined;
    if (!receipt) return NextResponse.json({ error: 'Nota não encontrada.' }, { status: 404 });

    conn.transaction(() => {
      conn.prepare('UPDATE receipts SET purchase_date = ?, discount_cents = ? WHERE id = ?')
        .run(body.purchase_date, body.discount_cents, receiptId);

      const keep = new Set<number>();
      const upd = conn.prepare(
        `UPDATE receipt_items SET product_id=?, line_no=?, raw_description=?, quantity=?, unit=?,
            unit_price_cents=?, discount_cents=?, total_cents=? WHERE id=? AND receipt_id=?`,
      );
      const ins = conn.prepare(
        `INSERT INTO receipt_items (receipt_id, product_id, line_no, raw_description, quantity, unit,
            unit_price_cents, discount_cents, total_cents) VALUES (?,?,?,?,?,?,?,?,?)`,
      );

      for (const it of body.items) {
        let productId = it.product_id;

        // Produto criado na hora: nasce já com o apelido ligado, para a próxima
        // nota deste mercado casar sozinha.
        if (!productId && it.new_product?.name) {
          productId = findOrCreateProduct({
            name: it.new_product.name.trim(),
            brand: it.new_product.brand?.trim() || null,
            category: it.new_product.category || 'Outros',
            pack_size: it.new_product.pack_size,
            pack_unit: it.new_product.pack_unit,
          });
        }
        if (productId) linkAlias(productId, receipt.market_id, it.raw_description);

        const args = [
          productId, it.line_no, it.raw_description, it.quantity, it.unit,
          it.unit_price_cents, it.discount_cents, it.total_cents,
        ] as const;

        if (it.id) {
          upd.run(...args, it.id, receiptId);
          keep.add(it.id);
        } else {
          keep.add(Number(ins.run(receiptId, ...args).lastInsertRowid));
        }
      }

      // Linhas removidas na conferência somem de verdade.
      const existing = conn.prepare('SELECT id FROM receipt_items WHERE receipt_id = ?').all(receiptId) as { id: number }[];
      const del = conn.prepare('DELETE FROM receipt_items WHERE id = ?');
      for (const row of existing) if (!keep.has(row.id)) del.run(row.id);

      const sum = conn.prepare('SELECT COALESCE(SUM(total_cents),0) s FROM receipt_items WHERE receipt_id = ?')
        .get(receiptId) as { s: number };
      conn.prepare('UPDATE receipts SET subtotal_cents=?, total_cents=? WHERE id=?')
        .run(sum.s, sum.s - body.discount_cents, receiptId);
    })();

    if (body.confirmar) confirmReceipt(receiptId);

    return NextResponse.json({ ok: true, confirmada: Boolean(body.confirmar) });
  } catch (err) {
    console.error('[nota] falha ao salvar', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

/** DELETE — apaga a nota e seus itens (ON DELETE CASCADE cuida das linhas). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    db().prepare('DELETE FROM receipts WHERE id = ?').run(Number(id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
