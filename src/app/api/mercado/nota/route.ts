import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseReceiptImage, hasVisionCredentials } from '@/lib/parse-receipt';
import { saveDraftReceipt, upsertMarket } from '@/lib/repo';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 120;

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
const MAX_BYTES = 12 * 1024 * 1024;

/** POST — foto da nota (tirada na hora ou anexada) vira um rascunho para conferência. */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('foto');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Envie uma foto da nota fiscal.' }, { status: 400 });
    }
    if (!ACCEPTED.includes(file.type as (typeof ACCEPTED)[number])) {
      return NextResponse.json(
        { error: 'Formato não suportado. Use JPG, PNG ou WEBP.' }, { status: 415 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'Foto muito grande (máx. 12 MB). Tente de novo com menos resolução.' }, { status: 413 },
      );
    }
    if (!hasVisionCredentials()) {
      return NextResponse.json(
        { error: 'Leitura por foto indisponível: falta configurar ANTHROPIC_API_KEY. Você pode lançar a nota manualmente.' },
        { status: 503 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());

    // Guarda a foto: é a prova de origem quando um preço parecer estranho depois.
    const dir = path.join(process.cwd(), 'public', 'notas');
    await mkdir(dir, { recursive: true });
    const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
    const name = `${randomUUID()}.${ext}`;
    await writeFile(path.join(dir, name), bytes);

    const parsed = await parseReceiptImage({
      imageBase64: bytes.toString('base64'),
      mediaType: file.type as (typeof ACCEPTED)[number],
    });

    const receiptId = saveDraftReceipt(parsed, `/notas/${name}`);
    return NextResponse.json({ receiptId, warnings: parsed.warnings });
  } catch (err) {
    const e = err as Error & { code?: string; receiptId?: number };
    if (e.code === 'DUPLICATE') {
      return NextResponse.json(
        { error: 'Esta nota já foi importada.', receiptId: e.receiptId }, { status: 409 },
      );
    }
    console.error('[nota] falha ao processar', e);
    return NextResponse.json({ error: e.message || 'Não consegui processar esta nota.' }, { status: 500 });
  }
}

/** PUT — cria um rascunho vazio para lançamento manual (sem foto). */
export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as { market_name?: string; purchase_date?: string };
    const marketName = body.market_name?.trim();
    if (!marketName) return NextResponse.json({ error: 'Informe o mercado.' }, { status: 400 });

    const marketId = upsertMarket(marketName);
    const date = body.purchase_date || new Date().toISOString().slice(0, 10);
    const info = db()
      .prepare(`INSERT INTO receipts (market_id, purchase_date, source, status) VALUES (?,?,'manual','rascunho')`)
      .run(marketId, date);

    return NextResponse.json({ receiptId: Number(info.lastInsertRowid) });
  } catch (err) {
    console.error('[nota manual] falha', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
