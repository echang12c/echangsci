import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { parseBRLToCents, parseQuantity } from './money';
import { normalizeUnit, extractPackSize } from './units';
import { CATEGORIES, type ParsedReceipt, type ParsedItem, type Unit } from './types';

/**
 * Extração de nota fiscal por visão.
 *
 * Decisão importante: o modelo devolve os valores como TEXTO, exatamente como
 * estão impressos ("12,99"), e a conversão para centavos acontece aqui em
 * `parseBRLToCents`. Pedir número pronto ao modelo trocaria uma transcrição
 * (que ele faz bem) por uma conversão de vírgula decimal (que é determinística
 * e testável em código). O resultado é menos erro de centavo.
 */

const UnitEnum = z.enum(['un', 'kg', 'g', 'l', 'ml']);

const ItemSchema = z.object({
  line_no: z.number().int().describe('Ordem da linha na nota, começando em 1'),
  raw_description: z.string().describe('A descrição EXATAMENTE como impressa na nota, sem corrigir abreviações'),
  market_code: z.string().nullable().describe('Código do produto no mercado, se impresso'),
  quantity: z.string().describe('Quantidade como impressa, ex. "1" ou "0,436"'),
  unit: UnitEnum.describe('Unidade da quantidade'),
  unit_price: z.string().describe('Valor unitário como impresso, ex. "12,99"'),
  discount: z.string().nullable().describe('Desconto da linha, se houver'),
  total: z.string().describe('Valor total da linha como impresso'),
  suggested_name: z.string().nullable().describe('Nome limpo e legível do produto, ex. "Arroz branco tipo 1"'),
  suggested_brand: z.string().nullable().describe('Marca, ex. "Tio João"'),
  suggested_category: z.enum(CATEGORIES).nullable(),
  suggested_pack_size: z.number().nullable().describe('Tamanho da embalagem, ex. 5 para "5KG"'),
  suggested_pack_unit: UnitEnum.nullable().describe('Unidade da embalagem'),
});

const ReceiptSchema = z.object({
  market_name: z.string().nullable(),
  market_cnpj: z.string().nullable(),
  market_city: z.string().nullable(),
  purchase_date: z.string().nullable().describe('Data da compra no formato YYYY-MM-DD'),
  access_key: z.string().nullable().describe('Chave de acesso da NFC-e, 44 dígitos, sem espaços'),
  subtotal: z.string().nullable(),
  discount: z.string().nullable().describe('Desconto do cupom inteiro'),
  total: z.string().nullable().describe('Valor total pago'),
  items: z.array(ItemSchema),
});

const SYSTEM = `Você extrai dados de notas fiscais e cupons fiscais de supermercado brasileiros (NFC-e / SAT / cupom não fiscal).

Regras:
- Transcreva "raw_description" LITERALMENTE, como está impresso, incluindo abreviações ("ARR TIO JOAO TP1 5KG"). Não normalize, não corrija, não traduza. Esse texto é a chave que liga a mesma compra entre mercados diferentes.
- Valores monetários: devolva o texto como impresso ("12,99"), sem símbolo de moeda. NÃO converta para número.
- "unit_price" é o valor unitário; "total" é o valor total da linha. Se a nota mostrar desconto por item, coloque em "discount".
- Itens vendidos a peso (hortifruti, açougue, frios) têm quantidade fracionada e unit "kg". Itens de prateleira têm unit "un".
- "suggested_pack_size"/"suggested_pack_unit" vêm do tamanho impresso na descrição ("5KG" -> 5 e "kg"; "900ML" -> 900 e "ml"). Deixe nulo para produtos a granel.
- "suggested_name" é um nome limpo e humano do produto, sem a marca e sem o tamanho.
- Se um campo não estiver legível, devolva null. NUNCA invente um valor.
- Inclua TODOS os itens da nota, na ordem impressa.`;

export interface ParseInput {
  imageBase64: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
}

export function hasVisionCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export async function parseReceiptImage({ imageBase64, mediaType }: ParseInput): Promise<ParsedReceipt> {
  const client = new Anthropic();

  const response = await client.messages.parse({
    model: 'claude-opus-5',
    max_tokens: 16000,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: 'Extraia todos os dados desta nota fiscal de supermercado.' },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(ReceiptSchema) },
  });

  const raw = response.parsed_output;
  if (!raw) {
    throw new Error('Não consegui ler esta nota. Tente uma foto mais nítida ou lance os itens manualmente.');
  }

  return toParsedReceipt(raw);
}

/**
 * Converte a transcrição do modelo no formato interno (centavos) e levanta as
 * divergências que o usuário precisa conferir antes de confirmar.
 *
 * Exportado separadamente da chamada de rede para ser testável sem API.
 */
export function toParsedReceipt(raw: z.infer<typeof ReceiptSchema>): ParsedReceipt {
  const warnings: string[] = [];

  const items: ParsedItem[] = raw.items.map((it, i) => {
    const quantity = parseQuantity(it.quantity) || 1;
    const unit = normalizeUnit(it.unit) as Unit;
    const unit_price_cents = parseBRLToCents(it.unit_price);
    const discount_cents = parseBRLToCents(it.discount);
    let total_cents = parseBRLToCents(it.total);

    // Confere a aritmética da linha. O OCR erra dígito; a multiplicação não.
    const expected = Math.round(unit_price_cents * quantity) - discount_cents;
    if (total_cents === 0 && expected > 0) {
      total_cents = expected;
    } else if (Math.abs(expected - total_cents) > 2) {
      warnings.push(
        `Linha ${i + 1} (${it.raw_description}): ${quantity} × ${it.unit_price} − ${it.discount ?? '0'} ` +
          `não bate com o total ${it.total}. Confira antes de confirmar.`,
      );
    }

    // Se o modelo não achou a embalagem, tenta extrair da própria descrição.
    const fallbackPack = extractPackSize(it.raw_description);
    const pack_size = it.suggested_pack_size ?? fallbackPack?.size ?? null;
    const pack_unit = (it.suggested_pack_unit ?? fallbackPack?.unit ?? null) as Unit | null;

    return {
      line_no: it.line_no || i + 1,
      raw_description: it.raw_description.trim(),
      market_code: it.market_code?.trim() || null,
      quantity,
      unit,
      unit_price_cents,
      discount_cents,
      total_cents,
      suggested_name: it.suggested_name?.trim() || null,
      suggested_brand: it.suggested_brand?.trim() || null,
      suggested_category: it.suggested_category ?? null,
      suggested_pack_size: pack_size,
      suggested_pack_unit: pack_unit,
    };
  });

  const itemsSum = items.reduce((a, it) => a + it.total_cents, 0);
  const receiptDiscount = parseBRLToCents(raw.discount);
  const declaredTotal = parseBRLToCents(raw.total);

  if (declaredTotal > 0 && Math.abs(itemsSum - receiptDiscount - declaredTotal) > 50) {
    warnings.push(
      `A soma dos itens não fecha com o total da nota. ` +
        `Pode ter faltado algum item na leitura da foto.`,
    );
  }
  if (!raw.purchase_date) warnings.push('Não achei a data da compra — preencha antes de confirmar.');
  if (!raw.market_name) warnings.push('Não achei o nome do mercado — preencha antes de confirmar.');

  // Chave de acesso só vale se tiver mesmo 44 dígitos.
  const key = raw.access_key?.replace(/\D/g, '') ?? '';

  return {
    market_name: raw.market_name?.trim() || null,
    market_cnpj: raw.market_cnpj?.replace(/\D/g, '') || null,
    market_city: raw.market_city?.trim() || null,
    purchase_date: normalizeDate(raw.purchase_date),
    access_key: key.length === 44 ? key : null,
    subtotal_cents: parseBRLToCents(raw.subtotal) || itemsSum,
    discount_cents: receiptDiscount,
    total_cents: declaredTotal || itemsSum - receiptDiscount,
    items,
    warnings,
  };
}

/** Aceita 'YYYY-MM-DD' e 'DD/MM/YYYY'; devolve sempre ISO ou null. */
function normalizeDate(input: string | null): string | null {
  if (!input) return null;
  const s = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}
