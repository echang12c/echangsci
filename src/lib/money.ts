/**
 * Dinheiro no Cofrin é sempre INTEGER em centavos. Estas são as únicas
 * fronteiras onde ele vira texto ou float.
 */

/** 1299 -> "R$ 12,99" */
export function formatBRL(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return '—';
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/** 1299 -> "12,99" (sem o símbolo, para eixos de gráfico e tabelas densas) */
export function formatNumberBRL(cents: number | null | undefined, digits = 2): string {
  if (cents == null || !Number.isFinite(cents)) return '—';
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * "12,99" | "R$ 12,99" | "12.99" | "1.234,56" -> centavos.
 *
 * O caso perigoso é o ponto sozinho: em pt-BR "1.234" é mil duzentos e trinta
 * e quatro reais, mas "12.99" é doze e noventa e nove. A regra que separa os
 * dois é a contagem de casas — exatamente três dígitos depois de um único
 * ponto é separador de milhar; qualquer outra coisa é decimal.
 */
export function parseBRLToCents(input: string | number | null | undefined): number {
  if (input == null || input === '') return 0;
  if (typeof input === 'number') return Math.round(input * 100);

  let s = input.replace(/[^\d.,-]/g, '').trim();
  if (!s) return 0;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    // Ambos presentes: o que vier por último é o decimal.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    // Só vírgula: decimal se tiver 1–2 casas depois, senão é milhar.
    s = s.length - lastComma - 1 <= 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot > -1) {
    // Só ponto: milhar quando há mais de um, ou quando sobram 3 dígitos.
    const decimals = s.length - lastDot - 1;
    const multipleDots = s.indexOf('.') !== lastDot;
    if (multipleDots || decimals === 3) s = s.replace(/\./g, '');
  }

  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * Quantidade: "0,436" | "0.436" -> 0.436
 *
 * Aqui o ponto é SEMPRE decimal, ao contrário do dinheiro. Quantidade na casa
 * dos milhares não existe em nota de mercado, mas fração de quilo existe em
 * toda compra de hortifruti — apagar o ponto transformaria 0.436 kg em 436 kg.
 */
export function parseQuantity(input: string | number | null | undefined): number {
  if (input == null || input === '') return 0;
  if (typeof input === 'number') return input;

  let s = String(input).replace(/[^\d.,-]/g, '').trim();
  if (!s) return 0;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = s.replace(',', '.');
  }

  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Quantidade para dentro de um <input> de texto: "0,436" — sem unidade. */
export function formatQuantityInput(q: number, unit: string): string {
  const digits = unit === 'un' ? (Number.isInteger(q) ? 0 : 2) : 3;
  return q.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatQuantity(q: number, unit: string): string {
  const digits = unit === 'un' ? (Number.isInteger(q) ? 0 : 2) : 3;
  return `${q.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} ${unit}`;
}
