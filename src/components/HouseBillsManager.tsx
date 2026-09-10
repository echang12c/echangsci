'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatBRL, formatNumberBRL, parseBRLToCents } from '@/lib/money';
import type { HouseBillWithEntry } from '@/lib/house';

interface Row extends HouseBillWithEntry {
  amountText: string;
}

interface EditFields {
  name: string;
  category: string;
  default_amount: string;
}

const toRow = (b: HouseBillWithEntry): Row => ({ ...b, amountText: formatNumberBRL(b.amount_cents) });

/**
 * Lista das contas do mês: check de paga, valor editável, editar e excluir,
 * mais o formulário de nova conta. Cada ação salva na hora — sem botão
 * "salvar tudo" separado, porque o checklist do mês precisa refletir o banco
 * a cada clique.
 */
export default function HouseBillsManager({ bills, month }: { bills: HouseBillWithEntry[]; month: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(bills.map(toRow));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [edit, setEdit] = useState<EditFields>({ name: '', category: '', default_amount: '' });
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [addingBusy, setAddingBusy] = useState(false);

  const patch = (id: number, p: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  async function saveEntry(row: Row, paid: boolean) {
    setBusyId(row.id);
    setError(null);
    try {
      const amount_cents = parseBRLToCents(row.amountText);
      const res = await fetch(`/api/casa/bills/${row.id}/entry`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, amount_cents, paid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Não consegui salvar.');
      patch(row.id, { amount_cents, paid, amountText: formatNumberBRL(amount_cents) });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(row: Row) {
    setEditingId(row.id);
    setEdit({ name: row.name, category: row.category ?? '', default_amount: formatNumberBRL(row.default_amount_cents) });
  }

  async function saveEdit(id: number) {
    if (!edit.name.trim()) { setError('Informe o nome da conta.'); return; }
    setBusyId(id);
    setError(null);
    try {
      const payload = {
        name: edit.name.trim(),
        category: edit.category.trim() || null,
        default_amount_cents: parseBRLToCents(edit.default_amount),
      };
      const res = await fetch(`/api/casa/bills/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Não consegui salvar.');
      patch(id, payload);
      setEditingId(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function removeBill(row: Row) {
    if (!window.confirm(`Excluir "${row.name}"? O histórico de meses pagos fica guardado, mas ela some da lista.`)) return;
    setBusyId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/casa/bills/${row.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Não consegui excluir.');
      setRows((rs) => rs.filter((r) => r.id !== row.id));
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function addBill() {
    if (!newName.trim()) { setError('Informe o nome da conta.'); return; }
    setAddingBusy(true);
    setError(null);
    try {
      const default_amount_cents = parseBRLToCents(newAmount);
      const category = newCategory.trim() || null;
      const res = await fetch('/api/casa/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), category, default_amount_cents }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Não consegui criar a conta.');

      const created = toRow({
        id: data.id, name: newName.trim(), category, default_amount_cents,
        created_at: '', amount_cents: default_amount_cents, paid: false, paid_at: null,
      });
      setRows((rs) => [...rs, created].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
      setNewName(''); setNewCategory(''); setNewAmount('');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAddingBusy(false);
    }
  }

  const paidRows = rows.filter((r) => r.paid);
  const pendingRows = rows.filter((r) => !r.paid);
  const totalPago = paidRows.reduce((a, r) => a + r.amount_cents, 0);
  const totalPendente = pendingRows.reduce((a, r) => a + r.amount_cents, 0);

  return (
    <>
      {error && <div className="alert alert-crit"><span aria-hidden>⚠</span><div>{error}</div></div>}

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">Pago este mês</div>
          <div className="kpi-value" style={{ color: 'var(--good)' }}>{formatBRL(totalPago)}</div>
          <div className="kpi-hint">{paidRows.length} conta{paidRows.length === 1 ? '' : 's'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Falta pagar</div>
          <div className="kpi-value">{formatBRL(totalPendente)}</div>
          <div className="kpi-hint">{pendingRows.length} conta{pendingRows.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      <section className="card">
        <div className="card-head"><h2>Contas</h2></div>
        {rows.length === 0 ? (
          <p className="muted" style={{ padding: '12px 0' }}>Nenhuma conta cadastrada ainda. Adicione a primeira abaixo.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Paga</th>
                  <th scope="col">Conta</th>
                  <th scope="col">Categoria</th>
                  <th scope="col" className="num">Valor este mês</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  editingId === row.id ? (
                    <EditRow
                      key={row.id}
                      value={edit}
                      onChange={(p) => setEdit((e) => ({ ...e, ...p }))}
                      onSave={() => saveEdit(row.id)}
                      onCancel={() => setEditingId(null)}
                      busy={busyId === row.id}
                    />
                  ) : (
                    <tr key={row.id}>
                      <td>
                        <input
                          type="checkbox" checked={row.paid} disabled={busyId === row.id}
                          aria-label={`${row.name} paga este mês`}
                          onChange={(e) => saveEntry(row, e.target.checked)}
                        />
                      </td>
                      <td style={{ fontWeight: 550, whiteSpace: 'normal' }}>{row.name}</td>
                      <td>{row.category ? <span className="chip">{row.category}</span> : <span className="muted">—</span>}</td>
                      <td className="num">
                        <input
                          type="text" inputMode="decimal" value={row.amountText} disabled={busyId === row.id}
                          aria-label={`Valor de ${row.name} este mês`}
                          onChange={(e) => patch(row.id, { amountText: e.target.value })}
                          onBlur={() => saveEntry(row, row.paid)}
                          style={{ width: 100, textAlign: 'right' }}
                        />
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn btn-sm btn-ghost" onClick={() => startEdit(row)} disabled={busyId === row.id}>
                            Editar
                          </button>
                          <button className="btn btn-sm btn-ghost" onClick={() => removeBill(row)} disabled={busyId === row.id}>
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head"><h2>Nova conta</h2></div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <Field label="Nome">
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                   placeholder="Ex.: Aluguel" style={{ width: '100%' }} />
          </Field>
          <Field label="Categoria (opcional)">
            <input type="text" value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
                   placeholder="Ex.: Moradia" style={{ width: '100%' }} />
          </Field>
          <Field label="Valor padrão (R$)" hint="palpite usado quando o mês ainda não foi editado">
            <input type="text" inputMode="decimal" value={newAmount} onChange={(e) => setNewAmount(e.target.value)}
                   placeholder="0,00" style={{ width: '100%' }} />
          </Field>
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="btn btn-primary" onClick={addBill} disabled={addingBusy}>
            {addingBusy ? 'Adicionando…' : '+ Adicionar conta'}
          </button>
        </div>
      </section>
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

function EditRow({
  value, onChange, onSave, onCancel, busy,
}: {
  value: EditFields; onChange: (p: Partial<EditFields>) => void;
  onSave: () => void; onCancel: () => void; busy: boolean;
}) {
  return (
    <tr>
      <td colSpan={5}>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', padding: '4px 0' }}>
          <Field label="Nome">
            <input type="text" value={value.name} onChange={(e) => onChange({ name: e.target.value })} style={{ width: '100%' }} />
          </Field>
          <Field label="Categoria">
            <input type="text" value={value.category} onChange={(e) => onChange({ category: e.target.value })} style={{ width: '100%' }} />
          </Field>
          <Field label="Valor padrão (R$)">
            <input type="text" inputMode="decimal" value={value.default_amount}
                   onChange={(e) => onChange({ default_amount: e.target.value })} style={{ width: '100%' }} />
          </Field>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <button className="btn btn-sm btn-primary" onClick={onSave} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
            <button className="btn btn-sm btn-ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
          </div>
        </div>
      </td>
    </tr>
  );
}
