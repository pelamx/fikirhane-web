import type { Config } from '../config.ts';

export interface Mail { to: string; subject: string; text: string; html: string }
/** Resolves when the provider accepted the message; throws otherwise. */
export type Mailer = (mail: Mail) => Promise<void>;

/**
 * Picks the outgoing mail channel. Resend is used over HTTPS because free hosts (Render) block SMTP ports.
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
  if (process.env.NODE_ENV !== 'production') {
    return async mail => { console.log(`[mail] to ${mail.to}: ${mail.subject}\n${mail.text}`); };
  }
  return null;
}
