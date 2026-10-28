import { Hono } from 'hono';
import { z } from 'zod';
import { ApiError, badRequest } from '../errors.ts';
import { body, clientIp, type Deps, type Env } from '../http.ts';
import { RateLimiter } from '../services/auth.ts';

export const CONTACT_TOPICS = ['general', 'membership', 'meeting_room', 'event_space', 'partnership'] as const;

const NewMessage = z.object({
  full_name: z.string().trim().min(1).max(120),
  contact_email: z.email().trim().toLowerCase().max(254).nullable().optional(),
  contact_phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/).nullable().optional(),
  topic: z.enum(CONTACT_TOPICS).default('general'),
  message: z.string().trim().min(1).max(2000),
  website: z.string().max(200).optional(), // left empty by people; filled by form-filling bots
});

/** "İletişim": anyone may write to the team; staff answer from the host shell. */
export function contactRoutes(deps: Deps) {
  const app = new Hono<Env>();
  const limiter = new RateLimiter(deps.config.contactMessagesPerHour, 60 * 60_000);

  app.post('/', async c => {
    const input = await body(c, NewMessage);
    if (input.website) return c.json({ ok: true }, 201);
    if (!input.contact_email && !input.contact_phone) throw badRequest('contact_required', 'Give an e-mail address or a phone number.');
    if (!limiter.allow(clientIp(c, deps.config.trustProxy))) throw new ApiError(429, 'rate_limited', 'Too many requests from this network. Try again later.');
    const [row] = await deps.sql<{ id_contact_message: string }[]>`
      insert into contact_messages (full_name, contact_email, contact_phone, topic, message, id_user)
      values (${input.full_name}, ${input.contact_email ?? null}, ${input.contact_phone ?? null}, ${input.topic}, ${input.message}, ${c.get('userId')})
      returning id_contact_message`;
    return c.json({ ok: true, id_contact_message: row.id_contact_message }, 201);
  });

  return app;
}
