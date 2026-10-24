import type { Config } from '../config.ts';
import { inTx, type Db, type Tx } from '../db.ts';
import { ApiError, conflict, notFound, unprocessable } from '../errors.ts';
import { uniqueCode } from './admin-write.ts';
import { audit } from './audit.ts';
import { CAPACITY_STATUSES, getBooking } from './bookings.ts';
import { membershipRights } from './membership.ts';
import { quote } from './pricing.ts';

/**
 * A plan's monthly guest right (membership_types.monthly_guest_passes, Plus = 1): one freepass of type guest per member
 * and calendar month (Istanbul time), issued on first look. The member spends it either by adding a friend to their own
 * booking (addGuest) or by handing the code to a friend who books with it (claimFreepass in bookings.ts). Both use the same
 * pass, so the monthly limit holds across the two ways.
 */

export interface GuestPass { code: string; valid_from: Date; valid_until: Date; usage_limit: number; remaining: number }

/** This month's guest pass of the member, created if their plan includes one; null when it does not. */
export async function currentGuestPass(db: Db, userId: string, config: Config): Promise<GuestPass | null> {
  const rights = await membershipRights(db, userId, config);
  if (!rights.monthlyGuestPasses) return null;
  return inTx(db, async tx => {
    const code = await uniqueCode(tx, 'freepasses', 'freepass_code');
    await tx`insert into freepasses (granted_to_user_id, freepass_code, freepass_type, distribution_source, valid_from, valid_until, usage_limit, notes)
      select ${userId}, ${code}, 'guest', 'referral', m, m + interval '1 month', ${rights.monthlyGuestPasses}, ${`Aylık misafir hakkı (${rights.name})`}
      from (select date_trunc('month', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul' as m) s
      on conflict (granted_to_user_id, valid_from) where granted_to_user_id is not null and freepass_type = 'guest' do nothing`;
    const [pass] = await tx<GuestPass[]>`
      select f.freepass_code as code, f.valid_from, f.valid_until, f.usage_limit,
             f.usage_limit - (select count(*)::int from freepass_redemptions r where r.id_freepass = f.id_freepass and r.status = 'active') as remaining
      from freepasses f
      where f.granted_to_user_id = ${userId} and f.freepass_type = 'guest' and f.valid_from = date_trunc('month', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul'
        and f.status = 'active'`;
    return pass ?? null;
  });
}

export interface GuestInput { firstName: string; lastName?: string | null; email?: string | null; phone?: string | null }

/**
 * Adds the member's friend to the same session as the member's own confirmed booking, free, using this month's guest pass.
 * The friend's booking has no account (guest name and contact), is booked by the member, gets its own entry QR and takes a
 * place like any booking: a seat at the member's table when one is free, otherwise the first free seat.
 */
export async function addGuest(db: Db, config: Config, input: { userId: string; bookingId: string; guest: GuestInput }) {
  const pass = await currentGuestPass(db, input.userId, config);
  if (!pass) throw new ApiError(403, 'guest_pass_unavailable', 'Your plan does not include guest passes.');
  return inTx(db, async tx => {
    const [own] = await tx<{ id_event: string; id_event_option: string; booking_status: string; id_seat: string | null;
      start_datetime: Date; base_price: string | null; currency_code: string | null }[]>`
      select b.id_event, b.id_event_option, b.booking_status, b.id_seat, e.start_datetime, e.base_price, e.currency_code
      from bookings b join events e using (id_event) where b.id_booking = ${input.bookingId} and b.id_user = ${input.userId}`;
    if (!own) throw notFound('Booking');
    if (own.booking_status !== 'confirmed') throw unprocessable('guest_needs_confirmed', 'Only a confirmed booking can bring a guest.');
    if (own.start_datetime.getTime() <= Date.now()) throw unprocessable('event_started', 'This event has already started.');
    const [already] = await tx`select 1 from bookings where id_event = ${own.id_event} and booked_by_user_id = ${input.userId}
      and id_user is null and booking_status in ${tx(CAPACITY_STATUSES)}`;
    if (already) throw conflict('guest_already_added', 'You already bring a guest to this event.');

    const [fp] = await tx<{ id_freepass: string; usage_limit: number }[]>`select id_freepass, usage_limit from freepasses
      where freepass_code = ${pass.code} for update`;
    const [{ used }] = await tx<{ used: number }[]>`select count(*)::int as used from freepass_redemptions
      where id_freepass = ${fp.id_freepass} and status = 'active'`;
    if (used >= fp.usage_limit) throw unprocessable('guest_pass_used', 'This month’s guest pass has been used.');

    const [option] = await tx<{ id_space_setup: string; capacity: number; booking_unit: string; price_adjustment: string }[]>`
      select id_space_setup, capacity, booking_unit, price_adjustment from event_options where id_event_option = ${own.id_event_option} for update`;
    if (option.booking_unit === 'table') throw unprocessable('guest_not_available', 'Guests cannot be added to a table booking.');
    const [{ taken }] = await tx<{ taken: number }[]>`select count(*)::int as taken from bookings
      where id_event_option = ${own.id_event_option} and booking_status in ${tx(CAPACITY_STATUSES)}`;
    if (taken >= option.capacity) throw conflict('sold_out', 'This option is full.');

    let seatId: string | null = null;
    if (option.booking_unit === 'seat') {
      const [seat] = await tx<{ id_seat: string }[]>`
        select s.id_seat from seats s
        where s.id_space_setup = ${option.id_space_setup} and s.status = 'active' and s.reservable
          and not exists (select 1 from bookings b where b.id_event_option = ${own.id_event_option} and b.id_seat = s.id_seat
                          and b.booking_status in ${tx(CAPACITY_STATUSES)})
        order by (s.id_table is not distinct from (select id_table from seats where id_seat = ${own.id_seat})) desc,
                 s.sort_order nulls last, s.seat_code
        limit 1`;
      if (!seat) throw conflict('sold_out', 'No seats are left in this option.');
      seatId = seat.id_seat;
    }
    const price = quote({ basePrice: own.base_price, priceAdjustment: option.price_adjustment, currency: own.currency_code,
      discountRate: null, freepass: true });
    if (!price) throw unprocessable('not_bookable', 'This event has no price yet.');

    const g = input.guest;
    const [booking] = await tx<{ id_booking: string }[]>`
      insert into bookings (id_event, id_event_option, id_user, booked_by_user_id, id_freepass, booking_status, booking_source,
        booking_unit, id_seat, price_list_amount, discount_amount, final_price, currency_code, payment_status,
        guest_first_name, guest_last_name, guest_email, guest_phone, created_by_user_id, updated_by_user_id)
      values (${own.id_event}, ${own.id_event_option}, null, ${input.userId}, ${fp.id_freepass}, 'confirmed', 'freepass',
        ${option.booking_unit}, ${seatId}, ${price.listAmount}, ${price.discountAmount}, ${price.finalPrice}, ${price.currency}, 'waived',
        ${g.firstName}, ${g.lastName ?? null}, ${g.email ?? null}, ${g.phone ?? null}, ${input.userId}, ${input.userId})
      returning id_booking`;
    await tx`insert into freepass_redemptions (id_freepass, id_booking, created_by_user_id, updated_by_user_id)
      values (${fp.id_freepass}, ${booking.id_booking}, ${input.userId}, ${input.userId})`;
    await audit(tx, { actorUserId: input.userId, action: 'booking.guest_added', entityType: 'booking', entityId: booking.id_booking,
      metadata: { member_booking: input.bookingId } });
    return getBooking(tx, booking.id_booking);
  });
}
