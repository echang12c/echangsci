import { NextResponse } from 'next/server';
import { upsertHouseBillEntry } from '@/lib/house';

export const runtime = 'nodejs';

interface EntryPayload {
  month: string; // 'YYYY-MM'
  amount_cents: number;
  paid: boolean;
}

/** PUT — grava o valor e a situação (paga/pendente) da conta num mês. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as EntryPayload;
    if (!/^\d{4}-\d{2}$/.test(body.month)) {
      return NextResponse.json({ error: 'Mês inválido.' }, { status: 400 });
    }
    upsertHouseBillEntry(Number(id), body.month, { amount_cents: body.amount_cents, paid: body.paid });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
