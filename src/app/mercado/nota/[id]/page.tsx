import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getReceiptWithItems } from '@/lib/queries';
import { db } from '@/lib/db';
import ReceiptEditor from '@/components/ReceiptEditor';
import { CATEGORIES } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function NotaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = getReceiptWithItems(Number(id));
  if (!data) notFound();

  const products = db()
    .prepare('SELECT id, name, brand, pack_size, pack_unit FROM products ORDER BY name')
    .all() as { id: number; name: string; brand: string | null; pack_size: number | null; pack_unit: string | null }[];

  return (
    <>
      <p className="page-sub" style={{ margin: '20px 0 0' }}>
        <Link href="/mercado/notas" className="muted">← Notas</Link>
      </p>
      <h1 style={{ marginTop: 6 }}>{data.receipt.market_name}</h1>
      <p className="page-sub">
        {data.receipt.status === 'confirmada'
          ? 'Nota confirmada. As alterações abaixo atualizam o histórico de preços.'
          : 'Confira os itens antes de confirmar. Só nota confirmada entra nas análises.'}
      </p>

      <ReceiptEditor
        receipt={data.receipt}
        initialItems={data.items}
        products={products}
        categories={[...CATEGORIES]}
      />
    </>
  );
}
