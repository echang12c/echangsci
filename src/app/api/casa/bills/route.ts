import { NextResponse } from 'next/server';
import { createHouseBill } from '@/lib/house';

export const runtime = 'nodejs';

interface BillPayload {
  name: string;
  category: string | null;
  default_amount_cents: number;
}

/** POST — cria uma conta nova. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as BillPayload;
    const id = createHouseBill(body);
    return NextResponse.json({ id });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
