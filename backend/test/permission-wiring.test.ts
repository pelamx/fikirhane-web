import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { SIGNED_IN, UNWIRED } from '../src/services/permission-wiring.ts';
import { setup, type TestEnv } from './helpers.ts';

let env: TestEnv;
before(async () => { env = await setup(); });
after(async () => { await env?.stop(); });

/** Every source file of the API except the wiring list itself, as one text to search for quoted permission codes. */
function sourceText(dir = join(import.meta.dirname, '..', 'src')): string {
  return readdirSync(dir, { withFileTypes: true }).map(e => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sourceText(path);
    return /\.(ts|json)$/.test(e.name) && e.name !== 'permission-wiring.ts' ? readFileSync(path, 'utf8') : '';
  }).join('\n');
}

describe('permission wiring', () => {
  test('the role screens mark exactly the permissions no endpoint checks', async () => {
    const codes = (await env.sql<{ code: string }[]>`select permission_code as code from permissions`).map(r => r.code);
    const source = sourceText();
    const used = (code: string) => new RegExp(`['"\`]${code.replace(/\./g, '\\.')}['"\`]`).test(source);
    for (const code of [...UNWIRED, ...SIGNED_IN]) assert.ok(codes.includes(code), `${code} is not in the permissions table`);
    assert.deepEqual([...UNWIRED].filter(used).sort(), [], 'now checked in code: remove these from UNWIRED');
    assert.deepEqual(codes.filter(c => !used(c) && !UNWIRED.has(c) && !SIGNED_IN.has(c)).sort(), [], 'checked nowhere: add to UNWIRED or wire them');
  });
});
