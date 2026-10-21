import type { Config } from '../config.ts';
import { inTx, type Db, type Tx } from '../db.ts';
import { ApiError, conflict, forbidden, notFound, unprocessable } from '../errors.ts';
import { audit } from './audit.ts';
import { membershipRights } from './membership.ts';
import { isZero, quote } from './pricing.ts';

export const CAPACITY_STATUSES = ['pending_payment', 'confirmed', 'checked_in'] as const;
const CANCELLABLE = ['pending_payment', 'confirmed', 'waitlisted'];

export interface BookingRequest {
  userId: string;
  eventId: string;
  eventOptionId?: string | null;
  seatId?: string | null;
  tableId?: string | null;
  freepassCode?: string | null;
  joinWaitlist?: boolean;
  needText?: string | null;
  offerText?: string | null;
  source?: 'web' | 'mobile_app';
}

interface OptionRow {
  id_event_option: string; id_space_setup: string; capacity: number; booking_unit: 'location' | 'table' | 'seat';
  price_adjustment: string; status: string;
}

interface EventRow {
  id_event: string; status: string; start_datetime: Date; end_datetime: Date; base_price: string | null; currency_code: string | null;
  event_type: string; enable_need: boolean; enable_offer: boolean;
}

/**
 * Creates a booking under the BOOKINGS rules: published future event, membership reservation window and
 * active-booking limit, option capacity (option row locked to serialize concurrent bookings), seat/table assignment,
 * freepass eligibility + usage limit, and a price snapshot.
 */
export async function createBooking(db: Db, config: Config, req: BookingRequest) {
  return inTx(db, async tx => {
    const [user] = await tx<{ account_status: string }[]>`select account_status from users where id_user = ${req.userId}`;
    if (user?.account_status !== 'active') throw forbidden('Your account cannot make bookings.');

    const [event] = await tx<EventRow[]>`
      select id_event, status, start_datetime, end_datetime, base_price, currency_code, event_type, enable_need, enable_offer
      from events where id_event = ${req.eventId}`;
    if (!event || event.status !== 'published') throw notFound('Event');
    if (event.start_datetime.getTime() <= Date.now()) throw unprocessable('event_started', 'This event has already started.');

    const options = await tx<OptionRow[]>`
      select id_event_option, id_space_setup, capacity, booking_unit, price_adjustment, status
      from event_options where id_event = ${event.id_event} and status = 'active' order by sort_order nulls last, option_code`;
    let option = req.eventOptionId ? options.find(o => o.id_event_option === req.eventOptionId) : options.length === 1 ? options[0] : undefined;
    if (!option) {
      throw req.eventOptionId || options.length === 0
        ? notFound('Event option')
        : unprocessable('option_required', 'Choose where you want to sit for this event.');
    }

    const rights = await membershipRights(tx, req.userId, config);
    const windowEnd = Date.now() + rights.reservationWindowDays * 86_400_000;
    if (event.start_datetime.getTime() > windowEnd) {
      throw unprocessable('outside_reservation_window', `Bookings open ${rights.reservationWindowDays} days before the event.`);
    }

    // Lock the user's row so two parallel requests cannot both pass the active-booking limit.
    await tx`select 1 from users where id_user = ${req.userId} for update`;
    const [{ active }] = await tx<{ active: number }[]>`
      select count(*)::int as active from bookings b join events e using (id_event)
      where b.id_user = ${req.userId} and b.booking_status in ${tx(CAPACITY_STATUSES)} and e.end_datetime > now()`;
    if (active >= rights.maxActiveBookings) {
      throw unprocessable('max_active_bookings', `You can hold at most ${rights.maxActiveBookings} active bookings.`);
    }
    const [existing] = await tx`select 1 from bookings where id_user = ${req.userId} and id_event = ${event.id_event}
      and booking_status in ('pending_payment', 'confirmed', 'checked_in', 'waitlisted')`;
    if (existing) throw conflict('already_booked', 'You already have a booking for this event.');

    // Serialize capacity decisions per option.
    [option] = await tx<OptionRow[]>`select id_event_option, id_space_setup, capacity, booking_unit, price_adjustment, status
      from event_options where id_event_option = ${option.id_event_option} for update`;
    const [{ taken }] = await tx<{ taken: number }[]>`select count(*)::int as taken from bookings
      where id_event_option = ${option.id_event_option} and booking_status in ${tx(CAPACITY_STATUSES)}`;
    const full = taken >= option.capacity;
    if (full && !req.joinWaitlist) throw conflict('sold_out', 'This option is full.');
    if (full && req.freepassCode) throw conflict('sold_out', 'This option is full.');

    let seatId: string | null = null;
    let tableId: string | null = null;
    if (!full && option.booking_unit === 'seat') seatId = await pickSeat(tx, option, req.seatId ?? null, rights.seatSelectionEnabled);
    if (!full && option.booking_unit === 'table') tableId = await pickTable(tx, option, req.tableId ?? null);

    const freepass = req.freepassCode ? await claimFreepass(tx, req.userId, req.freepassCode, event) : null;
    const price = quote({ basePrice: event.base_price, priceAdjustment: option.price_adjustment, currency: event.currency_code,
      discountRate: rights.discountRate, freepass: !!freepass });
    if (!price) throw unprocessable('not_bookable', 'This event has no price yet.');

    let status: string;
    let paymentStatus: string;
    let expiresAt: Date | null = null;
    if (full) { status = 'waitlisted'; paymentStatus = isZero(price.finalPrice) ? 'waived' : 'unpaid'; }
    else if (isZero(price.finalPrice)) { status = 'confirmed'; paymentStatus = 'waived'; }
    else if (config.paymentMode === 'pay_at_venue') { status = 'confirmed'; paymentStatus = 'unpaid'; }
    else { status = 'pending_payment'; paymentStatus = 'pending'; expiresAt = new Date(Date.now() + config.pendingPaymentHoldMinutes * 60_000); }

    const needId = event.enable_need && req.needText ? await insertNote(tx, 'needs', req.userId, req.needText) : null;
    const offerId = event.enable_offer && req.offerText ? await insertNote(tx, 'offers', req.userId, req.offerText) : null;

    let booking: { id_booking: string };
    try {
      [booking] = await tx<{ id_booking: string }[]>`
        insert into bookings (id_event, id_event_option, id_user, booked_by_user_id, id_freepass, id_membership_type_at_booking,
          booking_status, booking_source, expires_at, booking_unit, id_table, id_seat,
          id_need, need_text_snapshot, id_offer, offer_text_snapshot,
          price_list_amount, discount_amount, final_price, currency_code, payment_status, created_by_user_id, updated_by_user_id)
        values (${event.id_event}, ${option.id_event_option}, ${req.userId}, ${req.userId}, ${freepass?.id ?? null}, ${rights.idMembershipType},
          ${status}, ${freepass ? 'freepass' : req.source ?? 'web'}, ${expiresAt}, ${option.booking_unit}, ${tableId}, ${seatId},
          ${needId}, ${needId ? req.needText! : null}, ${offerId}, ${offerId ? req.offerText! : null},
          ${price.listAmount}, ${price.discountAmount}, ${price.finalPrice}, ${price.currency}, ${paymentStatus}, ${req.userId}, ${req.userId})
        returning id_booking`;
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw conflict('seat_taken', 'That place was just taken; please pick another.');
      throw err;
    }
    // FREEPASS_REDEMPTIONS rule 11: redemption only for confirmed bookings.
    if (freepass && status === 'confirmed') {
      await tx`insert into freepass_redemptions (id_freepass, id_booking, created_by_user_id, updated_by_user_id)
        values (${freepass.id}, ${booking.id_booking}, ${req.userId}, ${req.userId})`;
    }
    await tx`update user_acquisitions set converted_at = coalesce(converted_at, now()), conversion_type = coalesce(conversion_type, 'first_booking')
      where id_user = ${req.userId}`;
    return getBooking(tx, booking.id_booking);
  });
}

async function insertNote(tx: Tx, table: 'needs' | 'offers', userId: string, text: string): Promise<string> {
  const col = table === 'needs' ? 'need_text' : 'offer_text';
  const [row] = await tx<{ id: string }[]>`insert into ${tx(table)} (id_user, ${tx(col)}, created_by_user_id, updated_by_user_id)
    values (${userId}, ${text}, ${userId}, ${userId}) returning ${tx(table === 'needs' ? 'id_need' : 'id_offer')} as id`;
  return row.id;
}

/** The person's own seat choice if their rights allow it, else automatic assignment of the first free reservable seat (SEATS rule 13). */
async function pickSeat(tx: Tx, option: OptionRow, requested: string | null, selectionAllowed: boolean): Promise<string> {
  if (requested) {
    if (!selectionAllowed) throw forbidden('Seat selection is not available for this account.');
    const [free] = await tx<{ id_seat: string }[]>`
      select s.id_seat from seats s where s.id_seat = ${requested} and s.id_space_setup = ${option.id_space_setup}
        and s.status = 'active' and s.reservable
        and not exists (select 1 from bookings b where b.id_event_option = ${option.id_event_option} and b.id_seat = s.id_seat
                        and b.booking_status in ${tx(CAPACITY_STATUSES)})`;
    if (!free) throw conflict('seat_taken', 'That seat is not available.');
    return free.id_seat;
  }
  const [seat] = await tx<{ id_seat: string }[]>`
    select s.id_seat from seats s where s.id_space_setup = ${option.id_space_setup} and s.status = 'active' and s.reservable
      and not exists (select 1 from bookings b where b.id_event_option = ${option.id_event_option} and b.id_seat = s.id_seat
                      and b.booking_status in ${tx(CAPACITY_STATUSES)})
    order by s.sort_order nulls last, s.seat_code limit 1`;
  if (!seat) throw conflict('sold_out', 'No seats are left in this option.');
  return seat.id_seat;
}

async function pickTable(tx: Tx, option: OptionRow, requested: string | null): Promise<string> {
  const [table] = await tx<{ id_table: string }[]>`
    select t.id_table from tables t where t.id_space_setup = ${option.id_space_setup} and t.status = 'active' and t.reservable
      and (${requested}::uuid is null or t.id_table = ${requested})
      and not exists (select 1 from bookings b where b.id_event_option = ${option.id_event_option} and b.id_table = t.id_table
                      and b.booking_status in ${tx(CAPACITY_STATUSES)})
    order by t.sort_order nulls last, t.table_code limit 1`;
  if (!table) throw conflict(requested ? 'table_taken' : 'sold_out', 'No table is available.');
  return table.id_table;
}

/**
 * Validates a freepass for this user and event (FP-D07..D09, FPRED-D02/D03) under a row lock, claiming
 * an unowned pass for the user (FREEPASSES rule 16).
 */
async function claimFreepass(tx: Tx, userId: string, code: string, event: EventRow): Promise<{ id: string }> {
  const [fp] = await tx<{
    id_freepass: string; id_user: string | null; status: string; valid_from: Date; valid_until: Date; usage_limit: number;
    id_event: string | null; id_club: string | null; event_type: string | null;
  }[]>`select id_freepass, id_user, status, valid_from, valid_until, usage_limit, id_event, id_club, event_type
       from freepasses where freepass_code = ${code.trim().toUpperCase()} for update`;
  const invalid = new ApiError(422, 'freepass_invalid', 'This freepass code is not valid.');
  if (!fp || (fp.id_user && fp.id_user !== userId)) throw invalid;
  const now = Date.now();
  if (fp.status !== 'active' || fp.valid_from.getTime() > now || fp.valid_until.getTime() <= now) {
    throw new ApiError(422, 'freepass_expired', 'This freepass is no longer valid.');
  }
  if ((fp.id_event && fp.id_event !== event.id_event) || (fp.event_type && fp.event_type !== event.event_type)) {
    throw new ApiError(422, 'freepass_not_eligible', 'This freepass cannot be used for this event.');
  }
  if (fp.id_club) {
    const [linked] = await tx`select 1 from event_clubs where id_event = ${event.id_event} and id_club = ${fp.id_club} and status = 'active'`;
    if (!linked) throw new ApiError(422, 'freepass_not_eligible', 'This freepass cannot be used for this event.');
  }
  const [{ used }] = await tx<{ used: number }[]>`select count(*)::int as used from freepass_redemptions
    where id_freepass = ${fp.id_freepass} and status = 'active'`;
  if (used >= fp.usage_limit) throw new ApiError(422, 'freepass_used', 'This freepass has already been used.');
  if (!fp.id_user) {
    await tx`update freepasses set id_user = ${userId}, claimed_at = now(), updated_by_user_id = ${userId} where id_freepass = ${fp.id_freepass}`;
    await audit(tx, { actorUserId: userId, action: 'freepass.claim', entityType: 'freepass', entityId: fp.id_freepass });
  }
  return { id: fp.id_freepass };
}

/**
 * Cancels a booking. Owners may cancel until `cancellationLockHours` before the start (BOOK-D12); holders of
 * booking.cancel may cancel at any time. Within policy the freepass right is returned (FPRED rule 12).
 */
export async function cancelBooking(db: Db, config: Config, input: {
  bookingId: string; actorUserId: string; canCancelAny: boolean; reason?: string; note?: string | null;
}) {
  return inTx(db, async tx => {
    const [b] = await tx<{ id_user: string | null; booking_status: string; start_datetime: Date }[]>`
      select b.id_user, b.booking_status, e.start_datetime from bookings b join events e using (id_event)
      where b.id_booking = ${input.bookingId} for update of b`;
    if (!b) throw notFound('Booking');
    const own = b.id_user === input.actorUserId;
    if (!own && !input.canCancelAny) throw notFound('Booking');
    if (!CANCELLABLE.includes(b.booking_status)) throw unprocessable('not_cancellable', 'This booking can no longer be cancelled.');
    const lockAt = b.start_datetime.getTime() - config.cancellationLockHours * 3_600_000;
    const insideLock = Date.now() >= lockAt;
    if (insideLock && !input.canCancelAny) {
      throw new ApiError(403, 'cancellation_locked', `Bookings can be cancelled up to ${config.cancellationLockHours} hours before the event.`);
    }
    const reason = input.reason ?? (own ? 'user_request' : 'admin_override');
    await tx`update bookings set booking_status = 'cancelled', cancelled_at = now(), cancelled_by_user_id = ${input.actorUserId},
        cancellation_reason = ${reason}, override_reason = ${insideLock ? input.note ?? 'Cancelled inside the cancellation lock' : null},
        payment_status = case when payment_status = 'pending' then 'unpaid' else payment_status end,
        updated_by_user_id = ${input.actorUserId}
      where id_booking = ${input.bookingId}`;
    if (!insideLock || reason === 'event_cancelled') {
      await tx`update freepass_redemptions set status = 'reversed', reversed_at = now(), reversed_by_user_id = ${input.actorUserId},
          reversal_reason = ${reason}, updated_by_user_id = ${input.actorUserId}
        where id_booking = ${input.bookingId} and status = 'active'`;
    }
    await audit(tx, { actorUserId: input.actorUserId, action: 'booking.cancel', entityType: 'booking', entityId: input.bookingId,
      changeData: { booking_status: { old: b.booking_status, new: 'cancelled' } }, reason: input.note ?? reason,
      metadata: insideLock ? { override: 'cancellation_lock' } : undefined });
    return getBooking(tx, input.bookingId);
  });
}

export async function checkIn(db: Db, actorUserId: string, bookingId: string) {
  return inTx(db, async tx => {
    const [b] = await tx<{ booking_status: string }[]>`select booking_status from bookings where id_booking = ${bookingId} for update`;
    if (!b) throw notFound('Booking');
    if (b.booking_status !== 'confirmed') throw unprocessable('not_checkin_ready', 'Only confirmed bookings can be checked in.');
    await tx`update bookings set booking_status = 'checked_in', checkin_at = now(), updated_by_user_id = ${actorUserId} where id_booking = ${bookingId}`;
    return getBooking(tx, bookingId);
  });
}

export async function getBooking(db: Db, bookingId: string) {
  const [row] = await db`
    select b.id_booking, b.id_event, b.id_event_option, b.booking_status, b.payment_status, b.booking_unit,
           b.price_list_amount, b.discount_amount, b.final_price, b.currency_code, b.booked_at, b.expires_at, b.cancelled_at,
           b.checkin_at, s.seat_code, s.seat_name, t.table_code, t.table_name, e.event_title, e.start_datetime, e.end_datetime,
           o.option_name, l.location_name, (b.id_freepass is not null) as used_freepass
    from bookings b join events e using (id_event) join event_options o using (id_event_option)
    join locations l on l.id_location = o.id_location
    left join seats s on s.id_seat = b.id_seat left join tables t on t.id_table = b.id_table
    where b.id_booking = ${bookingId}`;
  return row;
}
