export type Unit = 'kg' | 'g' | 'l' | 'ml' | 'un';
export const UNITS: Unit[] = ['un', 'kg', 'g', 'l', 'ml'];

/** Unidades que carregam massa — só elas geram valor do kilo. */
export const MASS_UNITS: Unit[] = ['kg', 'g'];

export const CATEGORIES = [
  'Hortifruti', 'Açougue', 'Padaria', 'Laticínios', 'Mercearia',
  'Bebidas', 'Congelados', 'Limpeza', 'Higiene', 'Pet', 'Outros',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Uma linha da nota, como sai da foto e como o usuário confere na tela. */
export interface ParsedItem {
  line_no: number;
  raw_description: string;
  market_code: string | null;
  quantity: number;
  unit: Unit;
  unit_price_cents: number;
  discount_cents: number;
  total_cents: number;
  /** Palpite do modelo para o produto canônico — o usuário confirma. */
  suggested_name: string | null;
  suggested_brand: string | null;
  suggested_category: Category | string | null;
  suggested_pack_size: number | null;
  suggested_pack_unit: Unit | null;
}

export interface ParsedReceipt {
  market_name: string | null;
  market_cnpj: string | null;
  market_city: string | null;
  purchase_date: string | null;   // 'YYYY-MM-DD'
  access_key: string | null;      // 44 dígitos da NFC-e
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  items: ParsedItem[];
  /** Divergências que o usuário precisa olhar antes de confirmar. */
  warnings: string[];
}
