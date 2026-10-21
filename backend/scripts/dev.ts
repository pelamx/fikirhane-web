// One-command local stack: embedded PostgreSQL in backend/.data, migrations, demo data, a dev admin, and the
// API serving the site at http://localhost:8080. No Docker required.
import { join } from 'node:path';
import { startLocalDb } from './embedded-db.ts';

const db = await startLocalDb({ dir: join(import.meta.dirname, '..', '.data'), port: Number(process.env.DEV_DB_PORT ?? 54329), persistent: true });
process.env.DATABASE_URL = db.url;
process.env.COOKIE_SECURE ??= 'false';
process.env.CORS_ORIGINS ??= 'http://localhost:4173';

const { createDb } = await import('../src/db.ts');
const { migrate } = await import('../src/migrate.ts');
const { seedDemo } = await import('./seed-demo.ts');
const sql = createDb(db.url, 1);
await migrate(sql, console.log);
await seedDemo(sql);
await sql.end();
console.log(`dev database: ${db.url}`);
console.log('create an admin: ADMIN_PASSWORD=... DATABASE_URL=' + db.url + ' npm run create-admin -- you@example.com');

process.on('exit', () => { void db.stop(); });
await import('../src/server.ts');
