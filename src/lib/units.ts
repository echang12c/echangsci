import type { Unit } from './types';

/** Normaliza o que vem do OCR ("KG", "Kg", "UND", "PC") para a unidade canônica. */
export function normalizeUnit(raw: string | null | undefined): Unit {
  const s = (raw ?? '').trim().toLowerCase().replace(/\./g, '');
  if (['kg', 'quilo', 'quilos', 'k'].includes(s)) return 'kg';
  if (['g', 'gr', 'grama', 'gramas'].includes(s)) return 'g';
  if (['l', 'lt', 'lts', 'litro', 'litros'].includes(s)) return 'l';
  if (['ml', 'mls'].includes(s)) return 'ml';
  return 'un';
}

/**
 * Extrai o tamanho da embalagem da descrição impressa na nota.
 * "ARROZ TIO JOAO T1 5KG" -> { size: 5, unit: 'kg' }
 * "LEITE ITALAC 1L"       -> { size: 1, unit: 'l' }
 * "SABONETE 90G LEVE 6"   -> { size: 90, unit: 'g' }
 *
 * É o que permite calcular valor do kilo de um item vendido por unidade,
 * sem o usuário cadastrar embalagem à mão.
 */
export function extractPackSize(description: string): { size: number; unit: Unit } | null {
  const s = description.toUpperCase();
  // Número (com , ou . decimal) colado ou separado da unidade, no fim de uma palavra.
  const re = /(\d+(?:[.,]\d+)?)\s*(KG|G|GR|ML|L|LT)\b/g;
  let best: { size: number; unit: Unit } | null = null;

  for (const m of s.matchAll(re)) {
    const size = Number.parseFloat(m[1].replace(',', '.'));
    if (!Number.isFinite(size) || size <= 0) continue;
    const unit = normalizeUnit(m[2]);
    if (unit === 'un') continue;
    // Prefere a última ocorrência: em "LEITE 1L CX 12" o tamanho vem antes,
    // mas em "OLEO SOJA LIZA 900ML" também. Empate resolve pelo maior número
    // de dígitos, que costuma ser o tamanho real e não um código.
    if (!best || String(m[1]).length >= String(best.size).length) best = { size, unit };
  }
  return best;
}

/** Converte para kg. Devolve null quando a unidade não tem massa. */
export function toKg(quantity: number, unit: Unit): number | null {
  if (unit === 'kg') return quantity;
  if (unit === 'g') return quantity / 1000;
  return null;
}

/** Converte para litros. Devolve null quando a unidade não tem volume. */
export function toLiters(quantity: number, unit: Unit): number | null {
  if (unit === 'l') return quantity;
  if (unit === 'ml') return quantity / 1000;
  return null;
}
