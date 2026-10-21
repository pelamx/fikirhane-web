import { Hono } from 'hono';
import { z } from 'zod';
import { notFound } from '../errors.ts';
import { body, query, requireUser, type Deps, type Env } from '../http.ts';
import { createBooking, CAPACITY_STATUSES } from '../services/bookings.ts';
import { membershipRights } from '../services/membership.ts';
import { quote } from '../services/pricing.ts';
import { joinClub, leaveClub } from '../services/users.ts';

const clubCode = z.string().regex(/^[A-Z0-9_]{2,60}$/);
const EventsQuery = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  club: clubCode.optional(),
});
const NewBooking = z.object({
  event_id: z.uuid(),
  event_option_id: z.uuid().nullable().optional(),
  seat_id: z.uuid().nullable().optional(),
  table_id: z.uuid().nullable().optional(),
  freepass_code: z.string().trim().min(4).max(40).nullable().optional(),
  join_waitlist: z.boolean().optional(),
  need_text: z.string().trim().min(1).max(280).nullable().optional(),
  offer_text: z.string().trim().min(1).max(280).nullable().optional(),
});

interface EventRow {
  id_event: string; event_code: string | null; event_type: string; event_title: string; event_description: string | null;
  start_datetime: Date; end_datetime: Date; timezone: string; status: string; base_price: string | null; currency_code: string | null;
  networking_enabled: boolean; enable_need: boolean; enable_offer: boolean;
}

export function catalogRoutes(deps: Deps) {
  const app = new Hono<Env>();
  const { sql } = deps;

  app.get('/interests', async c => c.json({ items: await sql`select interest_code as code, interest_name as name, category
    from interests where status = 'active' order by sort_order nulls last, interest_name` }));
  app.get('/skills', async c => c.json({ items: await sql`select skill_code as code, skill_name as name, category
    from skills where status = 'active' order by sort_order nulls last, skill_name` }));
  app.get('/membership-types', async c => c.json({ items: await sql`select membership_type_code as code, membership_type_name as name, description,
      discount_rate, reservation_window_days, max_active_bookings, seat_selection_enabled, priority_booking_enabled
    from membership_types where status = 'active' order by sort_order` }));

  async function clubs(userId: string | null, code?: string) {
    return sql`
      select c.club_code, c.club_name, c.club_description, c.club_type, c.cover_image, c.logo,
             (select count(*)::int from club_users cu where cu.id_club = c.id_club and cu.status = 'active') as member_count,
             (select count(*)::int from event_clubs ec join events e using (id_event)
               where ec.id_club = c.id_club and ec.status = 'active' and e.status = 'published' and e.start_datetime > now()) as upcoming_events,
             ${userId ? sql`exists (select 1 from club_users cu where cu.id_club = c.id_club and cu.id_user = ${userId} and cu.status = 'active')` : sql`false`} as is_member
      from clubs c where c.status = 'active' ${code ? sql`and c.club_code = ${code}` : sql``}
      order by c.sort_order nulls last, c.club_name`;
  }

  app.get('/clubs', async c => c.json({ items: await clubs(c.get('userId')) }));
  app.get('/clubs/:code', async c => {
    const code = clubCode.parse(c.req.param('code'));
    const [club] = await clubs(c.get('userId'), code);
    if (!club) throw notFound('Club');
    return c.json({ club });
  });
  app.put('/clubs/:code/membership', async c => {
    const userId = requireUser(c);
    await joinClub(sql, userId, clubCode.parse(c.req.param('code')));
    return c.body(null, 204);
  });
  app.delete('/clubs/:code/membership', async c => {
    const userId = requireUser(c);
    await leaveClub(sql, userId, clubCode.parse(c.req.param('code')));
    return c.body(null, 204);
  });

  /** Published events with options, live availability and the caller's own price and booking. */
  async function events(userId: string | null, filter: { from: Date; to: Date; club?: string; id?: string }) {
    const rows = await sql<EventRow[]>`
      select e.id_event, e.event_code, e.event_type, e.event_title, e.event_description, e.start_datetime, e.end_datetime, e.timezone,
             e.status, e.base_price, e.currency_code, e.networking_enabled, e.enable_need, e.enable_offer
      from events e
      where e.status = 'published'
        ${filter.id ? sql`and e.id_event = ${filter.id}` : sql`and e.end_datetime > ${filter.from} and e.start_datetime < ${filter.to}`}
        ${filter.club ? sql`and exists (select 1 from event_clubs ec join clubs c using (id_club)
            where ec.id_event = e.id_event and ec.status = 'active' and c.club_code = ${filter.club})` : sql``}
      order by e.start_datetime limit 200`;
    if (!rows.length) return [];
    const ids = rows.map(r => r.id_event);
    const [clubLinks, options, mine, rights] = await Promise.all([
      sql<{ id_event: string; club_code: string; club_name: string; club_event_role: string; is_primary: boolean }[]>`
        select ec.id_event, c.club_code, c.club_name, ec.club_event_role, ec.is_primary from event_clubs ec join clubs c using (id_club)
        where ec.id_event in ${sql(ids)} and ec.status = 'active' order by ec.is_primary desc`,
      sql<{ id_event: string; id_event_option: string; option_code: string; option_name: string | null; location_code: string; location_name: string;
            capacity: number; booking_unit: string; price_adjustment: string; taken: number }[]>`
        select o.id_event, o.id_event_option, o.option_code, o.option_name, l.location_code, l.location_name, o.capacity, o.booking_unit,
               o.price_adjustment,
               (select count(*)::int from bookings b where b.id_event_option = o.id_event_option and b.booking_status in ${sql(CAPACITY_STATUSES)}) as taken
        from event_options o join locations l using (id_location)
        where o.id_event in ${sql(ids)} and o.status = 'active' order by o.sort_order nulls last`,
      userId ? sql<{ id_event: string; id_booking: string; booking_status: string; id_event_option: string }[]>`
        select id_event, id_booking, booking_status, id_event_option from bookings where id_user = ${userId} and id_event in ${sql(ids)}
          and booking_status in ('pending_payment', 'confirmed', 'checked_in', 'waitlisted')` : Promise.resolve([]),
      userId ? membershipRights(sql, userId, deps.config) : Promise.resolve(null),
    ]);
    return rows.map(e => ({
      ...e,
      clubs: clubLinks.filter(l => l.id_event === e.id_event).map(({ id_event: _, ...l }) => l),
      options: options.filter(o => o.id_event === e.id_event).map(({ id_event: _, taken, price_adjustment, ...o }) => ({
        ...o,
        available: Math.max(0, o.capacity - taken),
        price: quote({ basePrice: e.base_price, priceAdjustment: price_adjustment, currency: e.currency_code,
          discountRate: rights?.discountRate ?? null, freepass: false }),
      })),
      my_booking: mine.find(b => b.id_event === e.id_event) ?? null,
    }));
  }

  app.get('/events', async c => {
    const q = query(c, EventsQuery);
    const from = q.from ? new Date(q.from) : new Date();
    const to = q.to ? new Date(q.to) : new Date(from.getTime() + 60 * 86_400_000);
    return c.json({ items: await events(c.get('userId'), { from, to, club: q.club }) });
  });

  app.get('/events/:id', async c => {
    const id = z.uuid().safeParse(c.req.param('id'));
    if (!id.success) throw notFound('Event');
    const [event] = await events(c.get('userId'), { from: new Date(0), to: new Date(0), id: id.data });
    if (!event) throw notFound('Event');
    // Seat map for seat-based options: positions plus whether each seat is free (no identities of other participants).
    const seatMaps = await sql`
      select o.id_event_option, s.id_seat, s.seat_code, s.seat_name, s.position_x, s.position_y, s.rotation, t.table_code,
             not exists (select 1 from bookings b where b.id_event_option = o.id_event_option and b.id_seat = s.id_seat
                         and b.booking_status in ${sql(CAPACITY_STATUSES)}) as free
      from event_options o join seats s on s.id_space_setup = o.id_space_setup and s.status = 'active' and s.reservable
      left join tables t on t.id_table = s.id_table
      where o.id_event = ${id.data} and o.status = 'active' and o.booking_unit = 'seat'
      order by s.sort_order`;
    return c.json({ event: { ...event, seats: seatMaps } });
  });

  app.post('/bookings', async c => {
    const userId = requireUser(c);
    const input = await body(c, NewBooking);
    const booking = await createBooking(sql, deps.config, {
      userId, eventId: input.event_id, eventOptionId: input.event_option_id, seatId: input.seat_id, tableId: input.table_id,
      freepassCode: input.freepass_code, joinWaitlist: input.join_waitlist, needText: input.need_text, offerText: input.offer_text,
    });
    return c.json({ booking }, 201);
  });

  return app;
}
