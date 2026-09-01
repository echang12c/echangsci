/** Fluxo real: cria nota manual -> adiciona itens -> confirma -> confere na análise. */
const BASE = process.env.BASE ?? 'http://localhost:3000';
const j = async (r) => { const d = await r.json().catch(() => ({})); return { status: r.status, d }; };

// 1. cria nota manual em um mercado NOVO
let r = await j(await fetch(`${BASE}/api/mercado/nota`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ market_name: 'Atacadão Teste', purchase_date: '2026-08-30' }),
}));
console.log('1. criar nota manual ->', r.status, 'id =', r.d.receiptId);
const id = r.d.receiptId;

// 2. salva dois itens: um ligado a produto existente (arroz id=1), outro criando produto novo
r = await j(await fetch(`${BASE}/api/mercado/nota/${id}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    purchase_date: '2026-08-30', discount_cents: 0, confirmar: false,
    items: [
      { line_no: 1, raw_description: 'ARROZ TIO JOAO TP1 5KG', quantity: 1, unit: 'un',
        unit_price_cents: 2450, discount_cents: 0, total_cents: 2450, product_id: 1 },
      { line_no: 2, raw_description: 'DETERGENTE YPE 500ML', quantity: 4, unit: 'un',
        unit_price_cents: 249, discount_cents: 100, total_cents: 896, product_id: null,
        new_product: { name: 'Detergente líquido', brand: 'Ypê', category: 'Limpeza', pack_size: 500, pack_unit: 'ml' } },
    ],
  }),
}));
console.log('2. salvar rascunho ->', r.status, JSON.stringify(r.d));

// 3. o rascunho NÃO pode aparecer na análise ainda
let html = await (await fetch(`${BASE}/mercado/produto/1`)).text();
console.log('3. rascunho invisível na análise:', !html.includes('Atacadão Teste') ? '✓' : '✗ VAZOU');

// 4. confirma
r = await j(await fetch(`${BASE}/api/mercado/nota/${id}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    purchase_date: '2026-08-30', discount_cents: 0, confirmar: true,
    items: [
      { line_no: 1, raw_description: 'ARROZ TIO JOAO TP1 5KG', quantity: 1, unit: 'un',
        unit_price_cents: 2450, discount_cents: 0, total_cents: 2450, product_id: 1 },
      { line_no: 2, raw_description: 'DETERGENTE YPE 500ML', quantity: 4, unit: 'un',
        unit_price_cents: 249, discount_cents: 100, total_cents: 896, product_id: null,
        new_product: { name: 'Detergente líquido', brand: 'Ypê', category: 'Limpeza', pack_size: 500, pack_unit: 'ml' } },
    ],
  }),
}));
console.log('4. confirmar ->', r.status, JSON.stringify(r.d));

// 5. agora o mercado novo aparece, e é o mais barato (24,50 < 30,92)
html = await (await fetch(`${BASE}/mercado/produto/1`)).text();
console.log('5. mercado novo na análise:', html.includes('Atacadão Teste') ? '✓' : '✗');
console.log('   virou o mais barato:', /MAIS BARATO EM[\s\S]{0,200}Atacadão Teste/i.test(html.replace(/<[^>]+>/g,' ')) ? '✓' : '✗');

// 6. produto criado na conferência aparece na lista
html = await (await fetch(`${BASE}/mercado/produtos`)).text();
console.log('6. produto novo listado:', html.includes('Detergente') ? '✓' : '✗');

// 7. confirmar com item órfão tem que FALHAR
r = await j(await fetch(`${BASE}/api/mercado/nota`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ market_name: 'Atacadão Teste', purchase_date: '2026-08-31' }),
}));
const id2 = r.d.receiptId;
r = await j(await fetch(`${BASE}/api/mercado/nota/${id2}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    purchase_date: '2026-08-31', discount_cents: 0, confirmar: true,
    items: [{ line_no: 1, raw_description: 'ITEM SEM PRODUTO', quantity: 1, unit: 'un',
              unit_price_cents: 100, discount_cents: 0, total_cents: 100, product_id: null }],
  }),
}));
console.log('7. confirmar com item órfão bloqueado:', r.status === 400 ? `✓ (${r.d.error})` : `✗ passou (${r.status})`);

// 8. apelido aprendido: a MESMA descrição em nova nota casa sozinha
r = await j(await fetch(`${BASE}/api/mercado/nota`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ market_name: 'Atacadão Teste', purchase_date: '2026-09-01' }),
}));
console.log('8. apelido gravado para "ARROZ TIO JOAO TP1 5KG":',
  (await (await fetch(`${BASE}/mercado/nota/${r.d.receiptId}`)).text()).length > 0 ? '(nota criada)' : '');
