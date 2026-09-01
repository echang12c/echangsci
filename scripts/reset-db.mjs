/** Apaga o banco local. Uso: npm run db:reset */
import { rmSync } from 'node:fs';
import path from 'node:path';

const DIR = process.env.COFRIN_DATA_DIR ?? path.join(process.cwd(), '.data');
for (const f of ['cofrin.db', 'cofrin.db-wal', 'cofrin.db-shm']) {
  rmSync(path.join(DIR, f), { force: true });
}
console.log('✓ banco apagado — ele é recriado no próximo acesso');
