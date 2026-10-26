import type { Sql } from '../db.ts';
import { audit } from './audit.ts';

/**
 * Time-based state transitions. Validation never relies on these having run (dates are always re-checked);
 * the job only keeps stored statuses honest for reporting.
 */
export async function runJobs(db: Sql): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  await db.begin(async tx => {
    // BOOKINGS rule 17: unpaid holds release capacity.
    const expiredBookings = await tx<{ id_booking: string }[]>`
      update bookings set booking_status = 'expired', payment_status = case when payment_status = 'pending' then 'unpaid' else payment_status end
      where booking_status = 'pending_payment' and expires_at < now() returning id_booking`;
    result.expiredBookings = expiredBookings.length;

    // Kitchen payments left on the card page unlock their tab (0115); reads treat them as closed already.
    const expiredCheckouts = await tx<{ id_transaction: string }[]>`
      update kitchen_checkouts set status = 'expired' where status = 'open' and expires_at < now() returning id_transaction`;
    if (expiredCheckouts.length) {
      await tx`update transactions set status = 'cancelled' where status = 'pending' and id_transaction in ${tx(expiredCheckouts.map(k => k.id_transaction))}`;
    }
    result.expiredKitchenCheckouts = expiredCheckouts.length;

    // UMEM rule 13.
    const expiredMemberships = await tx<{ id_user_membership: string }[]>`
      update user_memberships set status = 'expired' where status = 'active' and end_date < current_date returning id_user_membership`;
    for (const m of expiredMemberships) {
      await audit(tx, { actorUserId: null, actorType: 'job', action: 'membership.expire', entityType: 'membership',
        entityId: m.id_user_membership, source: 'system_job' });
    }
    result.expiredMemberships = expiredMemberships.length;

    // FREEPASSES rule 19 and USER_ROLES rule D07.
    result.expiredFreepasses = (await tx`update freepasses set status = 'expired' where status = 'active' and valid_until < now() returning 1`).length;
    result.expiredRoles = (await tx`update user_roles set status = 'expired' where status = 'active' and expires_at < now() returning 1`).length;
    result.expiredInvitations = (await tx`update invitations set status = 'expired'
      where status in ('draft', 'sent', 'opened') and expires_at < now() returning 1`).length;

    // EVENTS rule 19: finished events complete; checked-in participation completes with them.
    const completed = await tx<{ id_event: string }[]>`
      update events set status = 'completed' where status = 'published' and end_datetime < now() returning id_event`;
    if (completed.length) {
      await tx`update bookings set booking_status = 'completed', checkout_at = coalesce(checkout_at, now())
        where booking_status = 'checked_in' and id_event in ${tx(completed.map(c => c.id_event))}`;
    }
    result.completedEvents = completed.length;
  });
  return result;
}
