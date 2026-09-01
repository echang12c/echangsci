import { db } from './db';
import type { ParsedReceipt, Unit } from './types';

/** Normaliza a descrição da nota para comparar: sem acento, sem espaço duplo, maiúscula. */
export function normalizeDescription(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

export function upsertMarket(name: string, cnpj?: string | null, city?: string | null): number {
  const conn = db();
  const clean = name.trim();

  if (cnpj) {
    const byCnpj = conn.prepare('SELECT id FROM markets WHERE cnpj = ?').get(cnpj) as { id: number } | undefined;
    if (byCnpj) return byCnpj.id;
  }
  const byName = conn.prepare('SELECT id FROM markets WHERE name = ?').get(clean) as { id: number } | undefined;
  if (byName) return byName.id;

  // `chain` é a primeira palavra do nome ("Carrefour Vila Mariana" -> "Carrefour"):
  // um palpite que o usuário pode corrigir, e que já habilita comparar redes.
  const chain = clean.split(/\s+/)[0] || clean;
  const info = conn
    .prepare('INSERT INTO markets (name, chain, cnpj, city) VALUES (?, ?, ?, ?)')
    .run(clean, chain, cnpj || null, city || null);
  return Number(info.lastInsertRowid);
}

/**
 * Acha o produto canônico para uma descrição de nota.
 * Ordem: apelido exato do mercado -> apelido global -> apelido normalizado.
 * Devolve null quando é a primeira vez que esse item aparece — aí o usuário
 * decide, e a escolha vira apelido para as próximas notas.
 */
export function matchProduct(rawDescription: string, marketId: number): number | null {
  const conn = db();
  const exact = conn
    .prepare(
      `SELECT product_id FROM product_aliases
        WHERE raw_description = ? AND (market_id = ? OR market_id IS NULL)
        ORDER BY market_id IS NULL LIMIT 1`,
    )
    .get(rawDescription, marketId) as { product_id: number } | undefined;
  if (exact) return exact.product_id;

  const target = normalizeDescription(rawDescription);
  const candidates = conn
    .prepare('SELECT product_id, raw_description FROM product_aliases WHERE market_id = ? OR market_id IS NULL')
    .all(marketId) as { product_id: number; raw_description: string }[];

  for (const c of candidates) {
    if (normalizeDescription(c.raw_description) === target) return c.product_id;
  }
  return null;
}

export function findOrCreateProduct(p: {
  name: string;
  brand: string | null;
  category: string;
  pack_size: number | null;
  pack_unit: Unit | null;
}): number {
  const conn = db();
  const existing = conn
    .prepare(
      `SELECT id FROM products
        WHERE name = ? AND COALESCE(brand,'') = COALESCE(?,'')
          AND COALESCE(pack_size,-1) = COALESCE(?,-1)
          AND COALESCE(pack_unit,'') = COALESCE(?,'')`,
    )
    .get(p.name, p.brand, p.pack_size, p.pack_unit) as { id: number } | undefined;
  if (existing) return existing.id;

  const info = conn
    .prepare('INSERT INTO products (name, brand, category, pack_size, pack_unit) VALUES (?,?,?,?,?)')
    .run(p.name, p.brand, p.category, p.pack_size, p.pack_unit);
  return Number(info.lastInsertRowid);
}

export function linkAlias(productId: number, marketId: number, rawDescription: string, marketCode?: string | null) {
  db()
    .prepare(
      `INSERT INTO product_aliases (product_id, market_id, raw_description, market_code)
       VALUES (?,?,?,?)
       ON CONFLICT DO NOTHING`,
    )
    .run(productId, marketId, rawDescription, marketCode || null);
}

/**
 * Grava a leitura da foto como RASCUNHO e já casa o que der com produtos
 * conhecidos. Nada entra na análise até o usuário confirmar.
 */
export function saveDraftReceipt(parsed: ParsedReceipt, imagePath: string | null): number {
  const conn = db();

  return conn.transaction(() => {
    const marketId = upsertMarket(parsed.market_name ?? 'Mercado sem nome', parsed.market_cnpj, parsed.market_city);

    if (parsed.access_key) {
      const dup = conn.prepare('SELECT id FROM receipts WHERE access_key = ?').get(parsed.access_key) as
        | { id: number }
        | undefined;
      if (dup) {
        throw Object.assign(new Error('Esta nota já foi importada.'), { receiptId: dup.id, code: 'DUPLICATE' });
      }
    }

    const receiptId = Number(
      conn
        .prepare(
          `INSERT INTO receipts (market_id, purchase_date, access_key, subtotal_cents, discount_cents, total_cents, image_path, source, status)
           VALUES (?,?,?,?,?,?,?,'foto','rascunho')`,
        )
        .run(
          marketId,
          parsed.purchase_date ?? new Date().toISOString().slice(0, 10),
          parsed.access_key,
          parsed.subtotal_cents,
          parsed.discount_cents,
          parsed.total_cents,
          imagePath,
        ).lastInsertRowid,
    );

    const insertItem = conn.prepare(
      `INSERT INTO receipt_items
        (receipt_id, product_id, line_no, raw_description, market_code, quantity, unit, unit_price_cents, discount_cents, total_cents)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    );

    for (const it of parsed.items) {
      let productId = matchProduct(it.raw_description, marketId);

      // Item novo com sugestão confiável do modelo: cria o produto já ligado.
      // O usuário ainda revisa tudo na tela de conferência antes de confirmar.
      if (!productId && it.suggested_name) {
        productId = findOrCreateProduct({
          name: it.suggested_name,
          brand: it.suggested_brand,
          category: (it.suggested_category as string) ?? 'Outros',
          pack_size: it.suggested_pack_size,
          pack_unit: it.suggested_pack_unit,
        });
        linkAlias(productId, marketId, it.raw_description, it.market_code);
      }

      insertItem.run(
        receiptId,
        productId,
        it.line_no,
        it.raw_description,
        it.market_code,
        it.quantity,
        it.unit,
        it.unit_price_cents,
        it.discount_cents,
        it.total_cents,
      );
    }

    return receiptId;
  })();
}

export function confirmReceipt(receiptId: number) {
  const conn = db();
  conn.transaction(() => {
    const orphan = conn
      .prepare('SELECT COUNT(*) n FROM receipt_items WHERE receipt_id = ? AND product_id IS NULL')
      .get(receiptId) as { n: number };
    if (orphan.n > 0) {
      throw new Error(`${orphan.n} item(ns) ainda sem produto. Ligue todos antes de confirmar.`);
    }
    const sum = conn
      .prepare('SELECT COALESCE(SUM(total_cents),0) s FROM receipt_items WHERE receipt_id = ?')
      .get(receiptId) as { s: number };
    conn
      .prepare("UPDATE receipts SET status='confirmada', subtotal_cents=? WHERE id=?")
      .run(sum.s, receiptId);
  })();
}
