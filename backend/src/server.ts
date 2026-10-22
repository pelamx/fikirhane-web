import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createDb } from './db.ts';
import { migrate } from './migrate.ts';
import { runJobs } from './services/jobs.ts';

const config = loadConfig();
const sql = createDb(config.databaseUrl);

if (process.env.MIGRATE_ON_START !== 'false') await migrate(sql, console.log);
// Clubs and rolling coworking sessions for a hosted preview; the seed is idempotent, so every restart only tops it up.
if (process.env.SEED_DEMO === 'true') {
  const { seedDemo } = await import('../scripts/seed-demo.ts');
  await seedDemo(sql);
  console.log('demo data loaded');
}

const app = createApp({ sql, config });
const server = serve({ fetch: app.fetch, port: config.port }, info => {
  console.log(`Fikirhane API listening on http://localhost:${info.port}${config.siteDir ? ' (serving site)' : ''}`);
});

const timer = config.jobIntervalSeconds > 0
  ? setInterval(() => runJobs(sql).catch(err => console.error('jobs failed', err)), config.jobIntervalSeconds * 1000)
  : null;

async function shutdown() {
  if (timer) clearInterval(timer);
  server.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
