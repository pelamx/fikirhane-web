import type { Config } from '../config.ts';
import { inTx, type Db } from '../db.ts';
import { notFound, unprocessable } from '../errors.ts';
import { audit } from './audit.ts';
import { cancelBooking, CAPACITY_STATUSES } from './bookings.ts';

export interface NewEvent {
  eventType: string;
  eventTitle: string;
  eventDescription?: string | null;
  eventCode?: string | null;
  startDatetime: string;
  endDatetime: string;
  basePrice?: string | null;
  currencyCode?: string | null;
  minimumAttendees?: number | null;
  networkingEnabled?: boolean;
  enableNeed?: boolean;
  enableOffer?: boolean;
  clubCode?: string | null;
  options: { locationCode: string; setupCode: string; optionCode: string; optionName?: string | null; capacity: number;
    bookingUnit?: 'location' | 'table' | 'seat' | null; priceAdjustment?: string | null }[];
}

/**
 * Creates a draft event with its options and (optionally) its primary organizing club. Club leads without the
 * global permission create events as `submitted` for Fikirhane approval (EVENTS rule 16).
 */
export async function createEvent(db: Db, actorUserId: string, input: NewEvent, status: 'draft' | 'submitted') {
  return inTx(db, async tx => {
    const [event] = await tx<{ id_event: string }[]>`
      insert into events (event_code, event_type, event_title, event_description, start_datetime, end_datetime, status, base_price,
        currency_code, minimum_attendees, networking_enabled, enable_need, enable_offer, created_by_user_id, updated_by_user_id)
      values (${input.eventCode ?? null}, ${input.eventType}, ${input.eventTitle}, ${input.eventDescription ?? null}, ${input.startDatetime},
        ${input.endDatetime}, ${status}, ${input.basePrice ?? null}, ${input.currencyCode ?? (input.basePrice != null ? 'TRY' : null)},
        ${input.minimumAttendees ?? null}, ${input.networkingEnabled ?? false}, ${input.enableNeed ?? false}, ${input.enableOffer ?? false},
        ${actorUserId}, ${actorUserId})
      returning id_event`;
    let sort = 10;
    for (const o of input.options) {
      const [setup] = await tx<{ id_space_setup: string; id_location: string; default_booking_unit: string | null; default_price_adjustment: string | null }[]>`
        select s.id_space_setup, s.id_location, s.default_booking_unit, l.default_price_adjustment
        from space_setups s join locations l using (id_location)
        where s.setup_code = ${o.setupCode} and l.location_code = ${o.locationCode}`;
      if (!setup) throw notFound(`Setup ${o.setupCode} at ${o.locationCode}`);
      // LOCATIONS.default_price_adjustment and SPACE_SETUPS.default_booking_unit are snapshotted as suggestions.
      await tx`insert into event_options (id_event, id_location, id_space_setup, option_code, option_name, capacity, booking_unit,
          price_adjustment, status, sort_order, created_by_user_id, updated_by_user_id)
        values (${event.id_event}, ${setup.id_location}, ${setup.id_space_setup}, ${o.optionCode}, ${o.optionName ?? null}, ${o.capacity},
          ${o.bookingUnit ?? setup.default_booking_unit ?? 'location'}, ${o.priceAdjustment ?? setup.default_price_adjustment ?? '0'},
          'active', ${sort}, ${actorUserId}, ${actorUserId})`;
      sort += 10;
    }
    if (input.clubCode) {
      const [club] = await tx<{ id_club: string }[]>`select id_club from clubs where club_code = ${input.clubCode} and status = 'active'`;
      if (!club) throw notFound('Club');
      await tx`insert into event_clubs (id_club, id_event, club_event_role, is_primary, created_by_user_id, updated_by_user_id)
        values (${club.id_club}, ${event.id_event}, 'organizer', true, ${actorUserId}, ${actorUserId})`;
    }
    await audit(tx, { actorUserId, action: 'event.create', entityType: 'event', entityId: event.id_event, source: 'admin_web' });
    return event.id_event;
  });
}

/** Publish preconditions (EVENTS rule 17): valid times, pricing resolvable, >= 1 active option, no location conflict. */
export async function publishEvent(db: Db, actorUserId: string, eventId: string) {
  return inTx(db, async tx => {
    const [e] = await tx<{ status: string; start_datetime: Date; end_datetime: Date; base_price: string | null }[]>`
      select status, start_datetime, end_datetime, base_price from events where id_event = ${eventId} for update`;
    if (!e) throw notFound('Event');
    if (!['draft', 'submitted', 'approved'].includes(e.status)) throw unprocessable('invalid_transition', `A ${e.status} event cannot be published.`);
    if (e.base_price === null) throw unprocessable('pricing_unresolved', 'Set a base price (0 for free events) before publishing.');
    const options = await tx<{ id_location: string; booking_unit: string; capacity: number; id_space_setup: string }[]>`
      select id_location, booking_unit, capacity, id_space_setup from event_options where id_event = ${eventId} and status = 'active'`;
    if (options.length === 0) throw unprocessable('no_options', 'A published event needs at least one active option.');
    for (const o of options) {
      if (o.booking_unit === 'seat') {
        const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from seats
          where id_space_setup = ${o.id_space_setup} and status = 'active' and reservable`;
        if (n < o.capacity) throw unprocessable('not_enough_seats', 'The setup has fewer bookable seats than the option capacity.');
      }
      if (o.booking_unit === 'table') {
        const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from tables
          where id_space_setup = ${o.id_space_setup} and status = 'active' and reservable`;
        if (n === 0) throw unprocessable('no_tables', 'The setup has no bookable tables.');
      }
    }
    // LOC rule 11: same location, overlapping time, another published event with an active option = conflict.
    const [clash] = await tx<{ event_title: string }[]>`
      select e2.event_title from event_options o1
      join event_options o2 on o2.id_location = o1.id_location and o2.status = 'active' and o2.id_event <> o1.id_event
      join events e2 on e2.id_event = o2.id_event and e2.status = 'published'
      where o1.id_event = ${eventId} and o1.status = 'active'
        and tstzrange(e2.start_datetime, e2.end_datetime) && tstzrange(${e.start_datetime}, ${e.end_datetime})
      limit 1`;
    if (clash) throw unprocessable('location_conflict', `The location is already used by "${clash.event_title}" at that time.`);
    await tx`update events set status = 'published', updated_by_user_id = ${actorUserId} where id_event = ${eventId}`;
    await audit(tx, { actorUserId, action: 'event.publish', entityType: 'event', entityId: eventId,
      changeData: { status: { old: e.status, new: 'published' } }, source: 'admin_web' });
  });
}

/** Cancels an event and all of its live bookings, returning freepass rights (EVENTS rule 18, FPRED rule 13). */
export async function cancelEvent(db: Db, config: Config, actorUserId: string, eventId: string, reason: string) {
  return inTx(db, async tx => {
    const [e] = await tx<{ status: string }[]>`select status from events where id_event = ${eventId} for update`;
    if (!e) throw notFound('Event');
    if (['cancelled', 'completed', 'archived'].includes(e.status)) throw unprocessable('invalid_transition', `A ${e.status} event cannot be cancelled.`);
    const bookings = await tx<{ id_booking: string }[]>`select id_booking from bookings where id_event = ${eventId}
      and booking_status in ${tx([...CAPACITY_STATUSES, 'waitlisted'])}`;
    for (const b of bookings) {
      await cancelBooking(tx, config, { bookingId: b.id_booking, actorUserId, canCancelAny: true, reason: 'event_cancelled', note: reason });
    }
    await tx`update events set status = 'cancelled', updated_by_user_id = ${actorUserId} where id_event = ${eventId}`;
    await audit(tx, { actorUserId, action: 'event.cancel', entityType: 'event', entityId: eventId, reason,
      changeData: { status: { old: e.status, new: 'cancelled' } }, source: 'admin_web', metadata: { cancelled_bookings: bookings.length } });
    return { cancelledBookings: bookings.length };
  });
}
