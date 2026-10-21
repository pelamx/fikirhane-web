// Starts a throwaway local PostgreSQL (embedded-postgres, no Docker or root needed) for development and tests.
import EmbeddedPostgres from 'embedded-postgres';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

export interface LocalDb { url: string; stop: () => Promise<void> }

export async function startLocalDb(options: { dir?: string; port?: number; persistent?: boolean } = {}): Promise<LocalDb> {
  const port = options.port ?? await freePort();
  const dir = options.dir ?? await mkdtemp(join(tmpdir(), 'fikirhane-pg-'));
  const pg = new EmbeddedPostgres({
    databaseDir: dir, user: 'postgres', password: 'postgres', port, persistent: options.persistent ?? false,
    onLog: () => {}, onError: () => {},
  });
  const { existsSync } = await import('node:fs');
  if (!existsSync(join(dir, 'PG_VERSION'))) await pg.initialise();
  await pg.start();
  try { await pg.createDatabase('fikirhane'); } catch { /* already exists */ }
  return {
    url: `postgres://postgres:postgres@127.0.0.1:${port}/fikirhane`,
    stop: async () => {
      await pg.stop();
      if (!options.persistent && !options.dir) await rm(dir, { recursive: true, force: true });
    },
  };
}
