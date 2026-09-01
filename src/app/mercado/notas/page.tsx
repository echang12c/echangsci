import Link from 'next/link';
import { getReceipts } from '@/lib/queries';
import { formatBRL } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function NotasPage() {
  const receipts = getReceipts(200);
  const pendentes = receipts.filter((r) => r.status !== 'confirmada').length;

  return (
    <>
      <h1>Notas</h1>
      <p className="page-sub">Todas as compras registradas. Rascunhos não entram nas análises.</p>

      {pendentes > 0 && (
        <div className="alert alert-warn">
          <span aria-hidden>ⓘ</span>
          <div>{pendentes} nota(s) aguardando conferência.</div>
        </div>
      )}

      {receipts.length === 0 ? (
        <div className="card">
          <div className="empty">
            <h3>Nenhuma nota ainda</h3>
            <p>Fotografe o cupom do mercado para começar.</p>
            <Link href="/mercado/nova" className="btn btn-primary">Adicionar nota</Link>
          </div>
        </div>
      ) : (
        <section className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Data</th><th scope="col">Mercado</th>
                  <th scope="col" className="num">Itens</th>
                  <th scope="col" className="num">Desconto</th>
                  <th scope="col" className="num">Total</th>
                  <th scope="col">Situação</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/mercado/nota/${r.id}`} style={{ fontWeight: 550 }}>
                        {r.purchase_date.split('-').reverse().join('/')}
                      </Link>
                    </td>
                    <td>{r.market_name}</td>
                    <td className="num">{r.item_count}</td>
                    <td className="num">{r.discount_cents ? formatBRL(r.discount_cents) : '—'}</td>
                    <td className="num">{formatBRL(r.total_cents)}</td>
                    <td>
                      <span className={`chip ${r.status === 'confirmada' ? 'chip-good' : 'chip-warn'}`}>
                        {r.status === 'confirmada' ? 'confirmada' : 'conferir'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
