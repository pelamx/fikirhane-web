import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { Client, grantRole, registered, setup, type TestEnv } from './helpers.ts';

let env: TestEnv;
before(async () => { env = await setup(); });
after(async () => { await env?.stop(); });

describe('contact messages', () => {
  test('anyone can write; staff with contact permissions read and mark it in the host shell', async () => {
    const guest = new Client(env);
    const sent = await guest.post('/api/contact', { full_name: 'Deniz Kaya', contact_email: 'Deniz@Example.com', topic: 'partnership',
      message: 'Bir atölye için iş birliği konuşabilir miyiz?' });
    assert.equal(sent.status, 201);

    assert.equal((await guest.post('/api/contact', { full_name: 'X', message: 'Merhaba' })).json.error.code, 'contact_required');
    assert.equal((await guest.post('/api/contact', { full_name: 'X', contact_phone: '+90 532 000 00 00', message: '   ' })).status, 400);
    assert.equal((await guest.post('/api/contact', { full_name: 'X', contact_phone: '+90 532 000 00 00', message: 'Hi', topic: 'spam' })).status, 400);

    const member = await registered(env);
    assert.equal((await member.client.get('/api/host/contact')).status, 403);

    const admin = await registered(env);
    await grantRole(env.sql, admin.userId, 'FIKIRHANE_ADMIN');
    const mine = (await admin.client.get('/api/host/contact')).json.items.find((r: any) => r.full_name === 'Deniz Kaya');
    assert.deepEqual([mine.contact_email, mine.topic, mine.status], ['deniz@example.com', 'partnership', 'new']);
    const updated = await admin.client.patch(`/api/host/contact/${mine.id_contact_message}`, { status: 'answered', staff_note: 'E-postayla dönüldü.' });
    assert.equal(updated.json.status, 'answered');
    assert.ok(!(await admin.client.get('/api/host/contact')).json.items.some((r: any) => r.id_contact_message === mine.id_contact_message));
    const closed = (await admin.client.get('/api/host/contact?durum=kapali')).json.items.find((r: any) => r.id_contact_message === mine.id_contact_message);
    assert.equal(closed.staff_note, 'E-postayla dönüldü.');
  });

  test('a filled honeypot is accepted but not stored', async () => {
    const bot = new Client(env);
    const before = (await env.sql`select count(*)::int as n from contact_messages`)[0].n;
    const res = await bot.post('/api/contact', { full_name: 'Bot', contact_email: 'bot@example.com', message: 'spam', website: 'http://spam' });
    assert.equal(res.status, 201);
    assert.equal((await env.sql`select count(*)::int as n from contact_messages`)[0].n, before);
  });
});
