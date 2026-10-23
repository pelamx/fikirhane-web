import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createDb } from './db.ts';
import { migrate } from './migrate.ts';
import { runJobs } from './services/jobs.ts';
import { mailChannel } from './services/mail.ts';

const config = loadConfig();
const sql = createDb(config.databaseUrl);

if (process.env.MIGRATE_ON_START !== 'false') await migrate(sql, console.log);
// Clubs and rolling coworking sessions for a hosted preview; the seed is idempotent, so every restart only tops it up.
if (process.env.SEED_DEMO === 'true') {
  const { seedDemo } = await import('../scripts/seed-demo.ts');
  await seedDemo(sql);
  console.log('demo data loaded');
}
// First admin for hosts without a shell (Render's free plan); an existing account is only given the role.
if (process.env.BOOTSTRAP_ADMIN_EMAIL) {
  const { ensureStaffAccount, splitFullName } = await import('./services/bootstrap.ts');
  const name = splitFullName(process.env.BOOTSTRAP_ADMIN_NAME);
  if (!name) console.log('BOOTSTRAP_ADMIN_NAME is not "First Last"; a new admin is named "Fikirhane Admin" until it is set');
  await ensureStaffAccount(sql, { email: process.env.BOOTSTRAP_ADMIN_EMAIL, password: process.env.BOOTSTRAP_ADMIN_PASSWORD, ...name },
    'BOOTSTRAP_ADMIN_EMAIL', console.log);
}

// Say once whether "forgot password" can email a link, so a missing key is visible in the deploy log.
const channel = mailChannel(config);
if (channel) console.log(`password reset emails via ${channel} from ${config.mailFrom}`);
else if (process.env.NODE_ENV === 'production') console.log('password reset emails are OFF: set BREVO_API_KEY or RESEND_API_KEY (and MAIL_FROM)');

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
