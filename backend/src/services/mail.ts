import type { Config } from '../config.ts';

export interface Mail { to: string; subject: string; text: string; html: string }
/** Resolves when the provider accepted the message; throws otherwise. */
export type Mailer = (mail: Mail) => Promise<void>;

/** "Fikirhane <info@example.com>" → name and address. */
export function parseFrom(from: string) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  return m ? { name: m[1].replace(/^"|"$/g, '') || undefined, email: m[2].trim() } : { name: undefined, email: from.trim() };
}

/** Which provider sends mail, for the startup log; null when forgot-password e-mails are off. */
export function mailChannel(config: Config): string | null {
  return config.resendApiKey ? 'Resend' : config.brevoApiKey ? 'Brevo' : null;
}

/**
 * Picks the outgoing mail channel. Providers are used over HTTPS because free hosts (Render) block SMTP ports.
 * Resend needs a verified domain to reach anyone but the account owner; Brevo can send from one verified address.
 * Without a provider, development prints messages to the console; production sends nothing (null).
 */
export function mailerFromConfig(config: Config): Mailer | null {
  if (config.resendApiKey) {
    const key = config.resendApiKey, from = config.mailFrom;
    return async mail => {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Resend rejected the message: ${res.status} ${(await res.text()).slice(0, 300)}`);
    };
  }
  if (config.brevoApiKey) {
    const key = config.brevoApiKey, sender = parseFrom(config.mailFrom);
    return async mail => {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender, to: [{ email: mail.to }], subject: mail.subject, textContent: mail.text, htmlContent: mail.html }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Brevo rejected the message: ${res.status} ${(await res.text()).slice(0, 300)}`);
    };
  }
  if (process.env.NODE_ENV !== 'production') {
    return async mail => { console.log(`[mail] to ${mail.to}: ${mail.subject}\n${mail.text}`); };
  }
  return null;
}
