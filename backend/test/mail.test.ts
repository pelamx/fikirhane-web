import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { loadConfig } from '../src/config.ts';
import { mailChannel, mailerFromConfig, parseFrom } from '../src/services/mail.ts';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function capture(status = 201) {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response('{}', { status }); }) as typeof fetch;
  return calls;
}
const mail = { to: 'uye@example.com', subject: 'Konu', text: 'metin', html: '<p>metin</p>' };

describe('mail', () => {
  test('Brevo sends from the verified sender in MAIL_FROM', async () => {
    const config = { ...loadConfig(), resendApiKey: null, brevoApiKey: 'xkeysib-test', mailFrom: 'Fikirhane <pelamx@gmail.com>' };
    assert.equal(mailChannel(config), 'Brevo');
    const calls = capture();
    await mailerFromConfig(config)!(mail);
    assert.equal(calls[0].url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal((calls[0].init.headers as Record<string, string>)['api-key'], 'xkeysib-test');
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
      sender: { name: 'Fikirhane', email: 'pelamx@gmail.com' }, to: [{ email: 'uye@example.com' }],
      subject: 'Konu', textContent: 'metin', htmlContent: '<p>metin</p>' });
  });

  test('a rejected message is an error, so the reset log shows why', async () => {
    const config = { ...loadConfig(), resendApiKey: null, brevoApiKey: 'xkeysib-test', mailFrom: 'a@b.co' };
    capture(400);
    await assert.rejects(mailerFromConfig(config)!(mail), /Brevo rejected the message: 400/);
  });

  test('Resend wins when both keys are set; no key means no channel', () => {
    assert.equal(mailChannel({ ...loadConfig(), resendApiKey: 're_x', brevoApiKey: 'xkeysib' }), 'Resend');
    assert.equal(mailChannel({ ...loadConfig(), resendApiKey: null, brevoApiKey: null }), null);
    assert.deepEqual(parseFrom('"Fikirhane Ekibi" <ekip@fikirhane.co>'), { name: 'Fikirhane Ekibi', email: 'ekip@fikirhane.co' });
    assert.deepEqual(parseFrom('ekip@fikirhane.co'), { name: undefined, email: 'ekip@fikirhane.co' });
  });
});
