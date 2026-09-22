import { NextResponse } from 'next/server';
import { updateHouseBill, deactivateHouseBill } from '@/lib/house';

export const runtime = 'nodejs';

interface BillPayload {
  name: string;
  category: string | null;
  default_amount_cents: number;
}

/** PATCH — edita nome, categoria e valor padrão da conta. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as BillPayload;
    updateHouseBill(Number(id), body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

/** DELETE — a conta some da lista, mas o histórico de meses pagos fica guardado. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    deactivateHouseBill(Number(id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
