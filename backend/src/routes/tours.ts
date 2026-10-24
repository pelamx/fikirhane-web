import { Hono } from 'hono';
import { z } from 'zod';
import { ApiError, badRequest } from '../errors.ts';
import { body, clientIp, type Deps, type Env } from '../http.ts';
import { RateLimiter } from '../services/auth.ts';

export const TOUR_INTERESTS = ['coworking', 'meeting_room', 'event_space', 'clubs'] as const;

const NewTour = z.object({
  first_name: z.string().trim().min(1).max(60),
  contact_email: z.email().trim().toLowerCase().max(254).nullable().optional(),
  contact_phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/).nullable().optional(),
  preferred_date: z.iso.date(),
  preferred_slot: z.enum(['morning', 'afternoon']),
  interests: z.array(z.enum(TOUR_INTERESTS)).max(TOUR_INTERESTS.length).default([]),
  note: z.string().trim().max(1000).nullable().optional(),
  website: z.string().max(200).optional(), // left empty by people; filled by form-filling bots
});

const istanbulDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** "Tur planla": anyone may ask to visit on a weekday within the next month; staff follow up from the host shell. */
export function tourRoutes(deps: Deps) {
  const app = new Hono<Env>();
  const limiter = new RateLimiter(deps.config.tourRequestsPerHour, 60 * 60_000);

  app.post('/', async c => {
    const input = await body(c, NewTour);
    if (input.website) return c.json({ ok: true }, 201);
    if (!input.contact_email && !input.contact_phone) throw badRequest('contact_required', 'Give an e-mail address or a phone number.');
    const today = istanbulDay(new Date());
    const last = istanbulDay(new Date(Date.now() + 31 * 86_400_000));
    const weekday = new Date(`${input.preferred_date}T12:00:00Z`).getUTCDay();
    if (input.preferred_date < today || input.preferred_date > last || weekday === 0 || weekday === 6) {
      throw badRequest('tour_date_invalid', 'Pick a weekday within the next month.');
    }
    if (!limiter.allow(clientIp(c, deps.config.trustProxy))) throw new ApiError(429, 'rate_limited', 'Too many requests from this network. Try again later.');
    const [row] = await deps.sql<{ id_tour_request: string }[]>`
      insert into tour_requests (first_name, contact_email, contact_phone, preferred_date, preferred_slot, interests, note, id_user)
      values (${input.first_name}, ${input.contact_email ?? null}, ${input.contact_phone ?? null}, ${input.preferred_date},
              ${input.preferred_slot}, ${input.interests}, ${input.note || null}, ${c.get('userId')})
      returning id_tour_request`;
    return c.json({ ok: true, id_tour_request: row.id_tour_request }, 201);
  });

  return app;
}
