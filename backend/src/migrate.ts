import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createDb, type Sql } from './db.ts';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations');

/** Applies pending migrations in filename order, each in its own transaction. Returns applied names. */
export async function migrate(sql: Sql, log: (msg: string) => void = () => {}): Promise<string[]> {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  // Serialize concurrent deploys.
  await sql`select pg_advisory_lock(727274)`;
  try {
    const done = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map(r => r.name));
    const files = (await readdir(MIGRATIONS_DIR)).filter(f => f.endsWith('.sql')).sort();
    const applied: string[] = [];
    for (const file of files) {
      if (done.has(file)) continue;
      const body = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      await sql.begin(async tx => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (name) values (${file})`;
      });
      applied.push(file);
      log(`applied ${file}`);
    }
    return applied;
  } finally {
    await sql`select pg_advisory_unlock(727274)`;
  }
}

if (import.meta.main) {
  const sql = createDb(process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/fikirhane', 1);
  try {
    const applied = await migrate(sql, console.log);
    console.log(applied.length ? `${applied.length} migration(s) applied` : 'database is up to date');
  } finally {
    await sql.end();
  }
}
