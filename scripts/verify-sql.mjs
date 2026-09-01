import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';

const db = new Database(':memory:');
db.pragma('foreign_keys = ON');
db.exec(readFileSync('db/schema.sql', 'utf8'));
db.exec(readFileSync('db/views.sql', 'utf8'));
console.log('✓ schema.sql e views.sql executam');

// --- dados de exemplo: mesmo arroz, dois mercados, três datas ---
db.exec(`
INSERT INTO markets (id,name,chain,city) VALUES
 (1,'Carrefour Vila Mariana','Carrefour','São Paulo'),
 (2,'Assaí Ipiranga','Assaí','São Paulo');

INSERT INTO products (id,name,brand,category,pack_size,pack_unit) VALUES
 (1,'Arroz branco tipo 1','Tio João','Mercearia',5,'kg'),
 (2,'Tomate italiano',NULL,'Hortifruti',NULL,NULL);

INSERT INTO receipts (id,market_id,purchase_date,subtotal_cents,discount_cents,total_cents,status) VALUES
 (1,1,'2026-06-10',0,0,0,'confirmada'),
 (2,2,'2026-07-12',0,0,0,'confirmada'),
 (3,1,'2026-08-05',0,0,0,'confirmada'),
 (4,1,'2026-08-20',0,0,0,'rascunho');

-- arroz 5kg: 1 pacote. Carrefour 32,90 | Assaí 28,50 | Carrefour 34,90 c/ 2,00 desc
INSERT INTO receipt_items (receipt_id,product_id,line_no,raw_description,quantity,unit,unit_price_cents,discount_cents,total_cents) VALUES
 (1,1,1,'ARROZ TIO JOAO T1 5KG',1,'un',3290,0,3290),
 (2,1,1,'ARR TIO JOAO TP1 5KG',1,'un',2850,0,2850),
 (3,1,1,'ARROZ TIO JOAO T1 5KG',1,'un',3490,200,3290),
 -- tomate a granel: 0,436 kg a 9,90/kg
 (1,2,2,'TOMATE ITALIANO KG',0.436,'kg',990,0,432),
 -- linha de rascunho: NÃO pode aparecer nas análises
 (4,1,1,'ARROZ TIO JOAO T1 5KG',1,'un',9900,0,9900);
`);

const brl = (c) => c == null ? '—' : 'R$ ' + (c/100).toFixed(2).replace('.', ',');

console.log('\n— v_items (peso e preço do kilo derivados) —');
for (const r of db.prepare(`SELECT product_name, market_name, purchase_date, quantity, unit,
    total_cents, weight_kg, net_unit_price_cents FROM v_items ORDER BY purchase_date, line_no`).all()) {
  const ppk = r.weight_kg ? r.total_cents / r.weight_kg : null;
  console.log(`  ${r.purchase_date} ${r.market_name.padEnd(24)} ${String(r.product_name).padEnd(22)} ` +
    `qtd=${r.quantity}${r.unit} total=${brl(r.total_cents)} peso=${r.weight_kg ?? '—'}kg kilo=${brl(ppk)}`);
}

console.log('\n— v_product_market_stats (mesmo produto por mercado) —');
for (const r of db.prepare(`SELECT product_name, market_name, purchases,
    avg_unit_price_cents, avg_price_per_kg_cents FROM v_product_market_stats ORDER BY product_name, market_name`).all()) {
  console.log(`  ${r.product_name.padEnd(22)} ${r.market_name.padEnd(24)} n=${r.purchases} ` +
    `médio=${brl(r.avg_unit_price_cents)} kilo=${brl(r.avg_price_per_kg_cents)}`);
}

console.log('\n— v_product_spread (vale trocar de mercado?) —');
for (const r of db.prepare('SELECT * FROM v_product_spread').all()) {
  console.log(`  ${r.product_name}: ${r.cheapest_market} ${brl(r.cheapest_cents)} vs ` +
    `${r.priciest_market} ${brl(r.priciest_cents)} → economia ${brl(r.savings_cents)} (${r.spread_pct.toFixed(1)}%)`);
}

console.log('\n— checagens —');
const draftLeak = db.prepare(`SELECT COUNT(*) n FROM v_items WHERE total_cents = 9900`).get().n;
console.log(`  rascunho fora das análises: ${draftLeak === 0 ? '✓' : '✗ VAZOU'}`);
const arroz = db.prepare(`SELECT weight_kg, total_cents FROM v_items WHERE product_id=1 AND purchase_date='2026-06-10'`).get();
console.log(`  arroz 1×5kg vira 5kg: ${arroz.weight_kg === 5 ? '✓' : '✗ ' + arroz.weight_kg}`);
const tomate = db.prepare(`SELECT weight_kg FROM v_items WHERE product_id=2`).get();
console.log(`  tomate granel 0,436kg: ${tomate.weight_kg === 0.436 ? '✓' : '✗ ' + tomate.weight_kg}`);
const desc = db.prepare(`SELECT net_unit_price_cents FROM v_items WHERE purchase_date='2026-08-05'`).get();
console.log(`  desconto rateado no unitário (3490-200=3290): ${desc.net_unit_price_cents === 3290 ? '✓' : '✗ ' + desc.net_unit_price_cents}`);
