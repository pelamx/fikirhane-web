// Loads seeds/demo.sql (clubs, coworking sessions, a meetup, demo accounts) into DATABASE_URL.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createDb, type Sql } from '../src/db.ts';

export async function seedDemo(sql: Sql): Promise<void> {
  const body = await readFile(join(import.meta.dirname, '..', 'seeds', 'demo.sql'), 'utf8');
  await sql.begin(tx => tx.unsafe(body));
}

if (import.meta.main) {
  const sql = createDb(process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/fikirhane', 1);
  try { await seedDemo(sql); console.log('demo data loaded'); } finally { await sql.end(); }
}
