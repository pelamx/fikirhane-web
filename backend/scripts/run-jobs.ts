// Runs the time-based status jobs once (for cron-style schedulers; the server also runs them every JOB_INTERVAL_SECONDS).
import { createDb } from '../src/db.ts';
import { runJobs } from '../src/services/jobs.ts';

const sql = createDb(process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/fikirhane', 1);
try { console.log(await runJobs(sql)); } finally { await sql.end(); }
