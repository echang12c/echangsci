'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NovaNota({ visionEnabled }: { visionEnabled: boolean }) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [manual, setManual] = useState(!visionEnabled);
  const [market, setMarket] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  function pick(f: File | null) {
    setError(null);
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function enviar() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('foto', file);
      const res = await fetch('/api/mercado/nota', { method: 'POST', body });
      const data = await res.json();

      if (!res.ok) {
        // Nota repetida não é erro morto: leva o usuário para a que já existe.
        if (res.status === 409 && data.receiptId) {
          router.push(`/mercado/nota/${data.receiptId}`);
          return;
        }
        throw new Error(data.error ?? 'Falha ao processar a nota.');
      }
      router.push(`/mercado/nota/${data.receiptId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function criarManual() {
    if (!market.trim()) { setError('Informe o nome do mercado.'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/mercado/nota', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market_name: market, purchase_date: date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/mercado/nota/${data.receiptId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      {error && <div className="alert alert-crit"><span aria-hidden>⚠</span><div>{error}</div></div>}

      {!visionEnabled && (
        <div className="alert alert-warn">
          <span aria-hidden>ⓘ</span>
          <div>
            A leitura por foto está desligada porque falta a chave <code>ANTHROPIC_API_KEY</code>.
            Você ainda pode lançar a nota manualmente.
          </div>
        </div>
      )}

      {visionEnabled && !manual && (
        <div className="card">
          {preview ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Prévia da nota fiscal enviada"
                   style={{ width: '100%', maxHeight: 420, objectFit: 'contain',
                            borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={enviar} disabled={busy}>
                  {busy ? 'Lendo a nota…' : 'Ler esta nota'}
                </button>
                <button className="btn" onClick={() => { setPreview(null); setFile(null); }} disabled={busy}>
                  Trocar foto
                </button>
              </div>
              {busy && (
                <p className="muted" style={{ fontSize: 13, marginBottom: 0, marginTop: 10 }}>
                  Isso leva alguns segundos. Você confere item por item na próxima tela.
                </p>
              )}
            </>
          ) : (
            <div className="empty" style={{ padding: '32px 20px' }}>
              <h3>Cupom fiscal do mercado</h3>
              <p>Enquadre a nota inteira, com boa luz. Se ela for muito longa, fotografe em partes e envie uma por vez.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => cameraRef.current?.click()}>Tirar foto</button>
                <button className="btn" onClick={() => fileRef.current?.click()}>Anexar imagem</button>
              </div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
                     onChange={(e) => pick(e.target.files?.[0] ?? null)} />
              <input ref={fileRef} type="file" accept="image/*" hidden
                     onChange={(e) => pick(e.target.files?.[0] ?? null)} />
            </div>
          )}
        </div>
      )}

      {manual ? (
        <div className="card">
          <div className="card-head"><h2>Lançar manualmente</h2></div>
          <p className="card-note">Crie a nota e adicione os itens na tela seguinte.</p>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div>
              <label htmlFor="m-nome" style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 550 }}>Mercado</label>
              <input id="m-nome" type="text" value={market} onChange={(e) => setMarket(e.target.value)}
                     placeholder="Ex.: Assaí Ipiranga" style={{ width: '100%', marginTop: 4 }} />
            </div>
            <div>
              <label htmlFor="m-data" style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 550 }}>Data da compra</label>
              <input id="m-data" type="date" value={date} onChange={(e) => setDate(e.target.value)}
                     style={{ width: '100%', marginTop: 4 }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={criarManual} disabled={busy}>
              {busy ? 'Criando…' : 'Criar nota'}
            </button>
            {visionEnabled && (
              <button className="btn btn-ghost" onClick={() => { setManual(false); setError(null); }} disabled={busy}>
                Voltar para a foto
              </button>
            )}
          </div>
        </div>
      ) : (
        <p style={{ textAlign: 'center', marginTop: 14 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { setManual(true); setError(null); }}>
            Prefiro lançar manualmente
          </button>
        </p>
      )}
    </>
  );
}
