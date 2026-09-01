/**
 * Popula o banco com compras de exemplo para ver os gráficos com dado real.
 * Uso: node scripts/seed.mjs
 */
import Database from 'better-sqlite3';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const DIR = process.env.COFRIN_DATA_DIR ?? path.join(process.cwd(), '.data');
mkdirSync(DIR, { recursive: true });
for (const f of ['cofrin.db', 'cofrin.db-wal', 'cofrin.db-shm']) {
  rmSync(path.join(DIR, f), { force: true });
}

const db = new Database(path.join(DIR, 'cofrin.db'));
db.pragma('foreign_keys = ON');
db.exec(readFileSync('db/schema.sql', 'utf8'));
db.exec(readFileSync('db/views.sql', 'utf8'));

const markets = [
  ['Carrefour Vila Mariana', 'Carrefour'],
  ['Assaí Ipiranga', 'Assaí'],
  ['Pão de Açúcar Paraíso', 'Pão de Açúcar'],
  ['Mercado do Zé', 'Mercado do Zé'],
];
const mIns = db.prepare('INSERT INTO markets (name, chain, city) VALUES (?,?,?)');
const marketIds = markets.map(([n, c]) => Number(mIns.run(n, c, 'São Paulo').lastInsertRowid));

// nome, marca, categoria, embalagem, unidade, preço-base (centavos), unidade de venda
const catalog = [
  ['Arroz branco tipo 1', 'Tio João', 'Mercearia', 5, 'kg', 3290, 'un'],
  ['Feijão carioca', 'Camil', 'Mercearia', 1, 'kg', 890, 'un'],
  ['Leite integral', 'Italac', 'Laticínios', 1, 'l', 549, 'un'],
  ['Café torrado e moído', 'Pilão', 'Mercearia', 500, 'g', 1890, 'un'],
  ['Óleo de soja', 'Liza', 'Mercearia', 900, 'ml', 749, 'un'],
  ['Açúcar refinado', 'União', 'Mercearia', 1, 'kg', 559, 'un'],
  ['Macarrão espaguete', 'Renata', 'Mercearia', 500, 'g', 449, 'un'],
  ['Sabão em pó', 'Omo', 'Limpeza', 1.6, 'kg', 2490, 'un'],
  ['Papel higiênico 12 rolos', 'Neve', 'Higiene', null, null, 2790, 'un'],
  ['Peito de frango', null, 'Açougue', null, null, 1890, 'kg'],
  ['Tomate italiano', null, 'Hortifruti', null, null, 990, 'kg'],
  ['Banana prata', null, 'Hortifruti', null, null, 699, 'kg'],
  ['Queijo mussarela', 'Tirolez', 'Laticínios', null, null, 4290, 'kg'],
  ['Cerveja lata', 'Original', 'Bebidas', 350, 'ml', 429, 'un'],
];
const pIns = db.prepare('INSERT INTO products (name, brand, category, pack_size, pack_unit) VALUES (?,?,?,?,?)');
const products = catalog.map((c) => ({
  id: Number(pIns.run(c[0], c[1], c[2], c[3], c[4]).lastInsertRowid),
  base: c[5], sellUnit: c[6], name: c[0],
}));

// Cada mercado tem um "fator de preço" estável — é o que o gráfico de comparação revela.
const factor = [1.0, 0.88, 1.16, 1.05];

const rIns = db.prepare(
  `INSERT INTO receipts (market_id, purchase_date, subtotal_cents, discount_cents, total_cents, source, status)
   VALUES (?,?,?,?,?,'foto','confirmada')`);
const iIns = db.prepare(
  `INSERT INTO receipt_items (receipt_id, product_id, line_no, raw_description, quantity, unit,
      unit_price_cents, discount_cents, total_cents) VALUES (?,?,?,?,?,?,?,?,?)`);
const aIns = db.prepare(
  `INSERT INTO product_aliases (product_id, market_id, raw_description) VALUES (?,?,?) ON CONFLICT DO NOTHING`);

let rng = 42;
const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const today = new Date('2026-09-01');
let receipts = 0, lines = 0;

for (let weeksAgo = 48; weeksAgo >= 0; weeksAgo -= 2) {
  const d = new Date(today);
  d.setDate(d.getDate() - weeksAgo * 7);
  const date = d.toISOString().slice(0, 10);

  const mi = rand() < 0.45 ? 0 : rand() < 0.6 ? 1 : rand() < 0.8 ? 2 : 3;
  const marketId = marketIds[mi];

  // inflação acumulada ao longo do ano + ruído da semana
  const drift = 1 + (48 - weeksAgo) * 0.0028;

  const receiptId = Number(rIns.run(marketId, date, 0, 0, 0).lastInsertRowid);
  receipts++;

  const picks = products.filter(() => rand() < 0.55);
  let sum = 0, line = 1;

  for (const p of picks) {
    const unitPrice = Math.round(p.base * factor[mi] * drift * (0.96 + rand() * 0.08));
    const qty = p.sellUnit === 'kg'
      ? Math.round((0.3 + rand() * 0.9) * 1000) / 1000
      : (rand() < 0.22 ? 2 : 1);
    const gross = Math.round(unitPrice * qty);
    const disc = rand() < 0.12 ? Math.round(gross * (0.05 + rand() * 0.15)) : 0;
    const total = gross - disc;

    const raw = `${p.name.toUpperCase().slice(0, 18)}${p.sellUnit === 'kg' ? ' KG' : ''}`;
    iIns.run(receiptId, p.id, line++, raw, qty, p.sellUnit, unitPrice, disc, total);
    aIns.run(p.id, marketId, raw);
    sum += total;
    lines++;
  }

  const cupom = rand() < 0.18 ? Math.round(sum * 0.03) : 0;
  db.prepare('UPDATE receipts SET subtotal_cents=?, discount_cents=?, total_cents=? WHERE id=?')
    .run(sum, cupom, sum - cupom, receiptId);
}

// Uma nota em rascunho, para a tela de conferência ter o que mostrar.
const draft = Number(db.prepare(
  `INSERT INTO receipts (market_id, purchase_date, source, status) VALUES (?,?,'foto','rascunho')`)
  .run(marketIds[1], '2026-08-29').lastInsertRowid);
iIns.run(draft, products[0].id, 1, 'ARROZ TIO JOAO T1 5KG', 1, 'un', 2990, 0, 2990);
iIns.run(draft, null, 2, 'BISC REC CHOC 130G', 3, 'un', 349, 100, 947);

console.log(`✓ ${receipts} notas confirmadas, ${lines} itens, ${products.length} produtos, ${markets.length} mercados`);
console.log('✓ 1 nota em rascunho para conferência');
