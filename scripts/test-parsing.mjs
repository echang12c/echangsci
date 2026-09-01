/** Testes das conversões que o OCR alimenta. Uso: node scripts/test-parsing.mjs */
import assert from 'node:assert/strict';
import { parseBRLToCents, parseQuantity } from '../src/lib/money.ts';
import { extractPackSize, normalizeUnit } from '../src/lib/units.ts';
import { toParsedReceipt } from '../src/lib/parse-receipt.ts';

let pass = 0;
const t = (name, fn) => { fn(); console.log(`  ✓ ${name}`); pass++; };

console.log('\nparseBRLToCents');
t('vírgula decimal brasileira', () => assert.equal(parseBRLToCents('12,99'), 1299));
t('com símbolo de moeda',       () => assert.equal(parseBRLToCents('R$ 12,99'), 1299));
t('separador de milhar',        () => assert.equal(parseBRLToCents('1.234,56'), 123456));
t('ponto decimal americano',    () => assert.equal(parseBRLToCents('12.99'), 1299));
t('milhar sem decimal',         () => assert.equal(parseBRLToCents('1.234'), 123400));
t('inteiro puro',               () => assert.equal(parseBRLToCents('7'), 700));
t('vazio vira zero',            () => assert.equal(parseBRLToCents(''), 0));
t('nulo vira zero',             () => assert.equal(parseBRLToCents(null), 0));
t('lixo vira zero',             () => assert.equal(parseBRLToCents('---'), 0));

console.log('\nparseQuantity');
t('fração de quilo', () => assert.equal(parseQuantity('0,436'), 0.436));
t('unidade inteira', () => assert.equal(parseQuantity('2'), 2));

console.log('\nextractPackSize');
t('5KG colado',   () => assert.deepEqual(extractPackSize('ARROZ TIO JOAO T1 5KG'), { size: 5, unit: 'kg' }));
t('900ML',        () => assert.deepEqual(extractPackSize('OLEO SOJA LIZA 900ML'), { size: 900, unit: 'ml' }));
t('1L',           () => assert.deepEqual(extractPackSize('LEITE ITALAC 1L'), { size: 1, unit: 'l' }));
t('com espaço',   () => assert.deepEqual(extractPackSize('CAFE PILAO 500 G'), { size: 500, unit: 'g' }));
t('granel = null',() => assert.equal(extractPackSize('TOMATE ITALIANO'), null));

console.log('\nnormalizeUnit');
t('KG maiúsculo', () => assert.equal(normalizeUnit('KG'), 'kg'));
t('UND -> un',    () => assert.equal(normalizeUnit('UND'), 'un'));
t('desconhecido cai em un', () => assert.equal(normalizeUnit('xyz'), 'un'));

console.log('\ntoParsedReceipt (transcrição do modelo -> centavos)');
const raw = {
  market_name: 'Carrefour Vila Mariana', market_cnpj: '12.345.678/0001-99', market_city: 'São Paulo',
  purchase_date: '15/08/2026', access_key: '3526 0812 3456 7890 1234 5678 9012 3456 7890 1234 5678',
  subtotal: '45,80', discount: '2,00', total: '43,80',
  items: [
    { line_no: 1, raw_description: 'ARROZ TIO JOAO T1 5KG', market_code: '7891', quantity: '1', unit: 'un',
      unit_price: '32,90', discount: null, total: '32,90', suggested_name: 'Arroz branco tipo 1',
      suggested_brand: 'Tio João', suggested_category: 'Mercearia', suggested_pack_size: 5, suggested_pack_unit: 'kg' },
    { line_no: 2, raw_description: 'TOMATE ITALIANO KG', market_code: null, quantity: '0,436', unit: 'kg',
      unit_price: '9,90', discount: null, total: '4,32', suggested_name: 'Tomate italiano',
      suggested_brand: null, suggested_category: 'Hortifruti', suggested_pack_size: null, suggested_pack_unit: null },
    // sem embalagem sugerida: o fallback tem que achar "900ML" na descrição
    { line_no: 3, raw_description: 'OLEO SOJA LIZA 900ML', market_code: null, quantity: '2', unit: 'un',
      unit_price: '7,49', discount: '1,00', total: '13,98', suggested_name: 'Óleo de soja',
      suggested_brand: 'Liza', suggested_category: 'Mercearia', suggested_pack_size: null, suggested_pack_unit: null },
  ],
};
const r = toParsedReceipt(raw);

t('data BR vira ISO',        () => assert.equal(r.purchase_date, '2026-08-15'));
t('chave de acesso limpa',   () => assert.equal(r.access_key, '35260812345678901234567890123456789012345678'));
t('chave tem 44 dígitos',    () => assert.equal(r.access_key.length, 44));
t('CNPJ só dígitos',         () => assert.equal(r.market_cnpj, '12345678000199'));
t('total em centavos',       () => assert.equal(r.total_cents, 4380));
t('unitário em centavos',    () => assert.equal(r.items[0].unit_price_cents, 3290));
t('quantidade fracionada',   () => assert.equal(r.items[1].quantity, 0.436));
t('desconto da linha',       () => assert.equal(r.items[2].discount_cents, 100));
t('embalagem do modelo',     () => assert.deepEqual([r.items[0].suggested_pack_size, r.items[0].suggested_pack_unit], [5, 'kg']));
t('embalagem por fallback',  () => assert.deepEqual([r.items[2].suggested_pack_size, r.items[2].suggested_pack_unit], [900, 'ml']));

// aritmética divergente tem que virar aviso, não passar batido
const bad = structuredClone(raw);
bad.items[0].total = '39,90';           // 1 × 32,90 != 39,90
const warned = toParsedReceipt(bad);
t('linha que não fecha vira aviso', () => assert.ok(warned.warnings.some((w) => w.includes('Linha 1'))));

// chave curta não pode ser aceita como chave de acesso
const shortKey = structuredClone(raw);
shortKey.access_key = '123';
t('chave inválida é descartada', () => assert.equal(toParsedReceipt(shortKey).access_key, null));

console.log(`\n${pass} testes passaram\n`);
