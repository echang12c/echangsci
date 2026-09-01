'use client';

import { useId, useState, useRef, useEffect, type ReactNode } from 'react';

/**
 * Largura real do container, em pixels.
 * Atributos de geometria do SVG (x, y, width) NÃO aceitam calc() — só número
 * ou porcentagem. Por isso a matemática do layout acontece aqui, em JS, e não
 * em CSS. Também mantém o texto nítido, o que um viewBox escalado não faria.
 */
export function useWidth<T extends HTMLElement>(fallback = 720) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Os seis slots categóricos, em ORDEM FIXA. Nunca cicle, nunca gere um sétimo. */
export const SERIES_VARS = [
  'var(--series-1)', 'var(--series-2)', 'var(--series-3)',
  'var(--series-4)', 'var(--series-5)', 'var(--series-6)',
] as const;

export const MAX_SERIES = SERIES_VARS.length;

/** Cor por ENTIDADE (id estável), nunca por posição na lista filtrada. */
export function colorForKey(key: string, order: string[]): string {
  const i = order.indexOf(key);
  return SERIES_VARS[i >= 0 && i < MAX_SERIES ? i : MAX_SERIES - 1];
}

export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) return [min];
  const span = max - min;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const start = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  const names = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${names[Number(m) - 1]}/${y.slice(2)}`;
}

/**
 * Casca de todo gráfico: título, nota, legenda e o par gráfico/tabela.
 *
 * A visão de tabela não é enfeite — é obrigatória. No modo claro três cores da
 * paleta ficam abaixo de 3:1 contra a superfície, e a regra de alívio exige um
 * caminho sem cor para o mesmo dado.
 */
export function ChartCard({
  title, note, legend, children, table, action,
}: {
  title: string;
  note?: string;
  legend?: ReactNode;
  children: ReactNode;
  table: ReactNode;
  action?: ReactNode;
}) {
  const [view, setView] = useState<'grafico' | 'tabela'>('grafico');
  const id = useId();

  return (
    <section className="card" aria-labelledby={`${id}-t`}>
      <div className="card-head" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 id={`${id}-t`}>{title}</h2>
          {note && <p className="card-note" style={{ marginBottom: 0 }}>{note}</p>}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {action}
          <div role="group" aria-label="Modo de visualização" style={{ display: 'flex', gap: 2 }}>
            {(['grafico', 'tabela'] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={`btn btn-sm ${view === v ? '' : 'btn-ghost'}`}
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {v === 'grafico' ? 'Gráfico' : 'Tabela'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === 'grafico' && legend && <div style={{ marginTop: 12 }}>{legend}</div>}
      <div style={{ marginTop: 12 }}>{view === 'grafico' ? children : <div className="table-wrap">{table}</div>}</div>
    </section>
  );
}

/** Legenda: sempre presente com 2+ séries, nunca com uma só (o título já nomeia). */
export function Legend({ items }: { items: { key: string; label: string; color: string }[] }) {
  if (items.length < 2) return null;
  return (
    <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map((it) => (
        <li key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text-secondary)' }}>
          <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: it.color, flexShrink: 0 }} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

export function EmptyChart({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
      {children}
    </div>
  );
}

/** Tooltip ancorado em coordenada do SVG, mantido dentro da caixa. */
export function Tooltip({
  x, y, width, children,
}: { x: number; y: number; width: number; children: ReactNode }) {
  const W = 190;
  const left = Math.min(Math.max(x - W / 2, 4), Math.max(width - W - 4, 4));
  return (
    <div
      role="tooltip"
      style={{
        position: 'absolute', left, top: y, width: W, pointerEvents: 'none',
        background: 'var(--surface-1)', border: '1px solid var(--border-strong)',
        borderRadius: 8, boxShadow: 'var(--shadow)', padding: '8px 10px',
        fontSize: 12.5, lineHeight: 1.45, zIndex: 5, transform: 'translateY(-50%)',
      }}
    >
      {children}
    </div>
  );
}
