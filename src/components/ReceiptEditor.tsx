'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatBRL, parseBRLToCents, parseQuantity, formatNumberBRL, formatQuantityInput } from '@/lib/money';
import { UNITS, type Unit } from '@/lib/types';

interface DbItem {
  id: number; product_id: number | null; line_no: number; raw_description: string;
  quantity: number; unit: string; unit_price_cents: number; discount_cents: number; total_cents: number;
  product_name: string | null; brand: string | null; category: string | null;
  pack_size: number | null; pack_unit: string | null;
}
interface Product { id: number; name: string; brand: string | null; pack_size: number | null; pack_unit: string | null }

/**
 * Campos monetários guardam o TEXTO digitado, não centavos.
 * Converter a cada tecla reescreveria "12,9" como "12,90" no meio da digitação.
 * A conversão acontece no salvamento, por `parseBRLToCents`.
 */
interface Row {
  id?: number;
  line_no: number;
  raw_description: string;
  quantity: string;
  unit: Unit;
  unit_price: string;
  discount: string;
  total: string;
  total_touched: boolean;   // enquanto falso, o total se recalcula sozinho
  product_id: number | null;
  new_name: string;
  new_brand: string;
  new_category: string;
  new_pack_size: string;
  new_pack_unit: Unit | '';
}

function toRow(it: DbItem): Row {
  return {
    id: it.id,
    line_no: it.line_no,
    raw_description: it.raw_description,
    quantity: formatQuantityInput(it.quantity, it.unit),
    unit: it.unit as Unit,
    unit_price: formatNumberBRL(it.unit_price_cents),
    discount: it.discount_cents ? formatNumberBRL(it.discount_cents) : '',
    total: formatNumberBRL(it.total_cents),
    total_touched: true,
    product_id: it.product_id,
    new_name: '', new_brand: '', new_category: 'Outros', new_pack_size: '', new_pack_unit: '',
  };
}

const computedTotal = (r: Row) =>
  Math.max(Math.round(parseBRLToCents(r.unit_price) * parseQuantity(r.quantity)) - parseBRLToCents(r.discount), 0);

export default function ReceiptEditor({
  receipt, initialItems, products, categories,
}: {
  receipt: { id: number; purchase_date: string; discount_cents: number; status: string; image_path: string | null };
  initialItems: DbItem[];
  products: Product[];
  categories: string[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initialItems.map(toRow));
  const [date, setDate] = useState(receipt.purchase_date);
  const [discount, setDiscount] = useState(receipt.discount_cents ? formatNumberBRL(receipt.discount_cents) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);

  const patch = (i: number, p: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const subtotal = useMemo(
    () => rows.reduce((a, r) => a + (r.total_touched ? parseBRLToCents(r.total) : computedTotal(r)), 0),
    [rows],
  );
  const pending = rows.filter((r) => !r.product_id && !r.new_name.trim()).length;

  function addRow() {
    setRows((rs) => [...rs, {
      line_no: rs.length + 1, raw_description: '', quantity: '1', unit: 'un',
      unit_price: '', discount: '', total: '', total_touched: false, product_id: null,
      new_name: '', new_brand: '', new_category: 'Outros', new_pack_size: '', new_pack_unit: '',
    }]);
  }

  async function save(confirmar: boolean) {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        purchase_date: date,
        discount_cents: parseBRLToCents(discount),
        confirmar,
        items: rows.map((r, i) => ({
          id: r.id,
          line_no: i + 1,
          raw_description: r.raw_description.trim() || r.new_name.trim() || 'Item sem descrição',
          quantity: parseQuantity(r.quantity) || 1,
          unit: r.unit,
          unit_price_cents: parseBRLToCents(r.unit_price),
          discount_cents: parseBRLToCents(r.discount),
          total_cents: r.total_touched ? parseBRLToCents(r.total) : computedTotal(r),
          product_id: r.product_id,
          new_product: r.product_id || !r.new_name.trim() ? undefined : {
            name: r.new_name.trim(),
            brand: r.new_brand.trim() || null,
            category: r.new_category,
            pack_size: r.new_pack_size ? parseQuantity(r.new_pack_size) : null,
            pack_unit: r.new_pack_unit || null,
          },
        })),
      };

      const res = await fetch(`/api/mercado/nota/${receipt.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Não consegui salvar.');

      if (confirmar) router.push('/mercado');
      else router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <div className="alert alert-crit"><span aria-hidden>⚠</span><div>{error}</div></div>}

      <div className="card">
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <Field label="Data da compra">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: '100%' }} />
          </Field>
          <Field label="Desconto da nota (R$)" hint="desconto aplicado no cupom inteiro">
            <input type="text" inputMode="decimal" value={discount} placeholder="0,00"
                   onChange={(e) => setDiscount(e.target.value)} style={{ width: '100%' }} />
          </Field>
          <Field label="Soma dos itens">
            <div style={{ fontWeight: 600, fontSize: 18, paddingTop: 5 }}>{formatBRL(subtotal)}</div>
          </Field>
          <Field label="Total a pagar">
            <div style={{ fontWeight: 600, fontSize: 18, paddingTop: 5 }}>
              {formatBRL(subtotal - parseBRLToCents(discount))}
            </div>
          </Field>
        </div>

        {receipt.image_path && (
          <div style={{ marginTop: 14 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => setShowPhoto((v) => !v)}>
              {showPhoto ? 'Esconder foto da nota' : 'Ver foto da nota'}
            </button>
            {showPhoto && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={receipt.image_path} alt="Foto da nota fiscal"
                   style={{ width: '100%', maxHeight: 520, objectFit: 'contain', marginTop: 10,
                            borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)' }} />
            )}
          </div>
        )}
      </div>

      {pending > 0 && (
        <div className="alert alert-warn" style={{ marginTop: 16 }}>
          <span aria-hidden>ⓘ</span>
          <div>
            {pending} item(ns) ainda sem produto. Escolha um produto existente ou dê um nome —
            é o que permite comparar o mesmo item entre mercados.
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        {rows.map((r, i) => (
          <ItemCard
            key={r.id ?? `novo-${i}`}
            row={r} index={i} products={products} categories={categories}
            onChange={(p) => patch(i, p)}
            onRemove={() => setRows((rs) => rs.filter((_, j) => j !== i))}
          />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn" onClick={addRow} disabled={busy}>+ Adicionar item</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => save(false)} disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar rascunho'}
          </button>
          <button className="btn btn-primary" onClick={() => save(true)} disabled={busy || pending > 0 || rows.length === 0}>
            {receipt.status === 'confirmada' ? 'Salvar alterações' : 'Confirmar nota'}
          </button>
        </div>
      </div>
      {pending > 0 && (
        <p className="muted" style={{ fontSize: 13, textAlign: 'right', marginTop: 6 }}>
          Ligue todos os itens a um produto para poder confirmar.
        </p>
      )}
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 550, marginBottom: 4 }}>{label}</div>
      {children}
      {hint && <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

function ItemCard({
  row, index, products, categories, onChange, onRemove,
}: {
  row: Row; index: number; products: Product[]; categories: string[];
  onChange: (p: Partial<Row>) => void; onRemove: () => void;
}) {
  const creating = !row.product_id;
  const total = row.total_touched ? parseBRLToCents(row.total) : computedTotal(row);
  const mismatch = row.total_touched && Math.abs(computedTotal(row) - parseBRLToCents(row.total)) > 2;

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
        <span className="chip" style={{ flexShrink: 0 }}>{index + 1}</span>
        <input type="text" value={row.raw_description} placeholder="Descrição como está na nota"
               onChange={(e) => onChange({ raw_description: e.target.value })}
               aria-label={`Descrição do item ${index + 1}`}
               style={{ flex: 1, fontWeight: 550 }} />
        <button className="btn btn-sm btn-ghost" onClick={onRemove} aria-label={`Remover item ${index + 1}`}>
          Remover
        </button>
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))' }}>
        <Field label="Quantidade">
          <input type="text" inputMode="decimal" value={row.quantity}
                 onChange={(e) => onChange({ quantity: e.target.value })} style={{ width: '100%' }} />
        </Field>
        <Field label="Unidade">
          <select value={row.unit} onChange={(e) => onChange({ unit: e.target.value as Unit })} style={{ width: '100%' }}>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="Valor unitário">
          <input type="text" inputMode="decimal" value={row.unit_price} placeholder="0,00"
                 onChange={(e) => onChange({ unit_price: e.target.value })} style={{ width: '100%' }} />
        </Field>
        <Field label="Desconto">
          <input type="text" inputMode="decimal" value={row.discount} placeholder="0,00"
                 onChange={(e) => onChange({ discount: e.target.value })} style={{ width: '100%' }} />
        </Field>
        <Field label="Valor total">
          <input type="text" inputMode="decimal"
                 value={row.total_touched ? row.total : formatNumberBRL(computedTotal(row))}
                 onChange={(e) => onChange({ total: e.target.value, total_touched: true })}
                 style={{ width: '100%', ...(mismatch ? { borderColor: 'var(--warning)' } : {}) }} />
        </Field>
      </div>

      {mismatch && (
        <p style={{ fontSize: 12, color: 'var(--warning)', margin: '8px 0 0' }}>
          Quantidade × unitário − desconto dá {formatBRL(computedTotal(row))}, e não {formatBRL(total)}.
          Confira, ou{' '}
          <button className="btn btn-sm btn-ghost" style={{ padding: '0 4px' }}
                  onClick={() => onChange({ total_touched: false, total: '' })}>
            recalcular
          </button>.
        </p>
      )}

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <Field label="Produto" hint="é o que liga esta linha às compras do mesmo item em outros mercados">
          <select value={row.product_id ?? ''} style={{ width: '100%' }}
                  onChange={(e) => onChange({ product_id: e.target.value ? Number(e.target.value) : null })}>
            <option value="">— criar novo produto —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.brand ? ` · ${p.brand}` : ''}{p.pack_size ? ` · ${p.pack_size}${p.pack_unit}` : ''}
              </option>
            ))}
          </select>
        </Field>

        {creating && (
          <div style={{ display: 'grid', gap: 10, marginTop: 10,
                        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
            <Field label="Nome do produto">
              <input type="text" value={row.new_name} placeholder="Ex.: Arroz branco tipo 1"
                     onChange={(e) => onChange({ new_name: e.target.value })} style={{ width: '100%' }} />
            </Field>
            <Field label="Marca">
              <input type="text" value={row.new_brand} placeholder="Ex.: Tio João"
                     onChange={(e) => onChange({ new_brand: e.target.value })} style={{ width: '100%' }} />
            </Field>
            <Field label="Categoria">
              <select value={row.new_category} onChange={(e) => onChange({ new_category: e.target.value })}
                      style={{ width: '100%' }}>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Embalagem" hint="permite o valor do kilo">
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="text" inputMode="decimal" value={row.new_pack_size} placeholder="5"
                       onChange={(e) => onChange({ new_pack_size: e.target.value })}
                       aria-label="Tamanho da embalagem" style={{ width: '100%' }} />
                <select value={row.new_pack_unit} onChange={(e) => onChange({ new_pack_unit: e.target.value as Unit | '' })}
                        aria-label="Unidade da embalagem">
                  <option value="">—</option>
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </Field>
          </div>
        )}
      </div>
    </div>
  );
}
