import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.COFRIN_DATA_DIR ?? path.join(process.cwd(), '.data');
const DB_PATH = path.join(DATA_DIR, 'cofrin.db');

let instance: Database.Database | null = null;

/**
 * Conexão única e preguiçosa. Next recarrega módulos em dev, então o handle
 * vive no globalThis para não abrir um banco novo a cada hot reload.
 */
export function db(): Database.Database {
  const g = globalThis as { __cofrinDb?: Database.Database };
  if (g.__cofrinDb) return g.__cofrinDb;
  if (instance) return instance;

  mkdirSync(DATA_DIR, { recursive: true });
  const conn = new Database(DB_PATH);

  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');

  const sqlDir = path.join(process.cwd(), 'db');
  conn.exec(readFileSync(path.join(sqlDir, 'schema.sql'), 'utf8'));
  // Views são DROP+CREATE, então recriar a cada boot mantém a análise em dia
  // com o arquivo sem precisar de migração.
  conn.exec(readFileSync(path.join(sqlDir, 'views.sql'), 'utf8'));

  instance = conn;
  g.__cofrinDb = conn;
  return conn;
}
