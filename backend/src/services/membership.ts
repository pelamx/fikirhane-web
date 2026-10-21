import type { Config } from '../config.ts';
import { inTx, type Db } from '../db.ts';
import { conflict, notFound, unprocessable } from '../errors.ts';
import { audit } from './audit.ts';

export interface MembershipRights {
  idUserMembership: string | null;
  idMembershipType: string | null;
  code: string | null; // null = Visitor
  name: string;
  discountRate: string | null;
  reservationWindowDays: number;
  maxActiveBookings: number;
  seatSelectionEnabled: boolean;
  priorityBookingEnabled: boolean;
  endDate: string | null;
}

/** Current rights: active membership (UMEM rule 12) or the Visitor policy from config. */
export async function membershipRights(db: Db, userId: string, config: Config): Promise<MembershipRights> {
  const [m] = await db<{
    id_user_membership: string; id_membership_type: string; membership_type_code: string; membership_type_name: string;
    discount_rate: string; reservation_window_days: number; max_active_bookings: number;
    seat_selection_enabled: boolean; priority_booking_enabled: boolean; end_date: string | null;
  }[]>`
    select um.id_user_membership, mt.id_membership_type, mt.membership_type_code, mt.membership_type_name, mt.discount_rate,
           mt.reservation_window_days, mt.max_active_bookings, mt.seat_selection_enabled, mt.priority_booking_enabled,
           to_char(um.end_date, 'YYYY-MM-DD') as end_date
    from user_memberships um join membership_types mt using (id_membership_type)
    where um.id_user = ${userId} and um.status = 'active'
      and um.start_date <= current_date and (um.end_date is null or um.end_date >= current_date)`;
  if (!m) {
    return {
      idUserMembership: null, idMembershipType: null, code: null, name: 'Visitor', discountRate: null,
      reservationWindowDays: config.visitorReservationWindowDays, maxActiveBookings: config.visitorMaxActiveBookings,
      seatSelectionEnabled: config.visitorSeatSelection, priorityBookingEnabled: false, endDate: null,
    };
  }
  return {
    idUserMembership: m.id_user_membership, idMembershipType: m.id_membership_type, code: m.membership_type_code,
    name: m.membership_type_name, discountRate: m.discount_rate, reservationWindowDays: m.reservation_window_days,
    maxActiveBookings: m.max_active_bookings, seatSelectionEnabled: m.seat_selection_enabled,
    priorityBookingEnabled: m.priority_booking_enabled, endDate: m.end_date,
  };
}

const OPEN = ['draft', 'submitted', 'under_review', 'waitlisted'];

export async function submitApplication(db: Db, userId: string, input: {
  membershipTypeCode: string; motivationText?: string | null; offerText?: string | null; needText?: string | null;
}) {
  return inTx(db, async tx => {
    const [type] = await tx<{ id_membership_type: string }[]>`
      select id_membership_type from membership_types where membership_type_code = ${input.membershipTypeCode} and status = 'active'`;
    if (!type) throw notFound('Membership type');
    // MAPP-D09: no re-application for the type the user already holds.
    const [active] = await tx`select 1 from user_memberships
      where id_user = ${userId} and id_membership_type = ${type.id_membership_type} and status = 'active'`;
    if (active) throw conflict('already_member', 'You already hold this membership.');
    const [open] = await tx`select 1 from membership_applications
      where id_user = ${userId} and id_membership_type = ${type.id_membership_type} and status in ${tx(OPEN)}`;
    if (open) throw conflict('application_open', 'You already have an open application for this membership.');
    const [row] = await tx<{ id_membership_application: string }[]>`
      insert into membership_applications (id_user, id_membership_type, status, motivation_text, offer_text, need_text, submitted_at,
        created_by_user_id, updated_by_user_id)
      values (${userId}, ${type.id_membership_type}, 'submitted', ${input.motivationText ?? null}, ${input.offerText ?? null},
        ${input.needText ?? null}, now(), ${userId}, ${userId})
      returning id_membership_application`;
    await audit(tx, { actorUserId: userId, action: 'application.submitted', entityType: 'membership_application',
      entityId: row.id_membership_application, source: 'public_web', metadata: { membership_type: input.membershipTypeCode } });
    return row.id_membership_application;
  });
}

export async function withdrawApplication(db: Db, userId: string, applicationId: string) {
  return inTx(db, async tx => {
    const [app] = await tx<{ status: string }[]>`select status from membership_applications
      where id_membership_application = ${applicationId} and id_user = ${userId} for update`;
    if (!app) throw notFound('Application');
    if (!OPEN.includes(app.status)) throw unprocessable('not_open', 'Only open applications can be withdrawn.');
    await tx`update membership_applications set status = 'withdrawn', updated_by_user_id = ${userId}
      where id_membership_application = ${applicationId}`;
    await audit(tx, { actorUserId: userId, action: 'application.withdrawn', entityType: 'membership_application',
      entityId: applicationId, changeData: { status: { old: app.status, new: 'withdrawn' } } });
  });
}

export type Decision = 'under_review' | 'approved' | 'waitlisted' | 'declined';

/**
 * Review decision. Approval creates a separate USER_MEMBERSHIPS row (MAPP-D04/D05) and, for an upgrade,
 * closes the previous active membership as `ended` rather than mutating it (UMEM-D05).
 */
export async function decideApplication(db: Db, config: Config, reviewerId: string, applicationId: string, input: {
  decision: Decision; decisionNote?: string | null; decisionReason?: string | null; waitlistUntil?: string | null;
}) {
  return inTx(db, async tx => {
    const [app] = await tx<{ id_user: string; id_membership_type: string; status: string }[]>`
      select id_user, id_membership_type, status from membership_applications
      where id_membership_application = ${applicationId} for update`;
    if (!app) throw notFound('Application');
    const allowed: Record<string, Decision[]> = {
      submitted: ['under_review', 'approved', 'waitlisted', 'declined'],
      under_review: ['approved', 'waitlisted', 'declined'],
      waitlisted: ['under_review', 'approved', 'declined'],
    };
    if (!allowed[app.status]?.includes(input.decision)) {
      throw unprocessable('invalid_transition', `Cannot move an application from ${app.status} to ${input.decision}.`);
    }
    const reviewed = input.decision !== 'under_review';
    await tx`update membership_applications set status = ${input.decision},
        reviewed_at = ${reviewed ? tx`now()` : tx`reviewed_at`},
        reviewed_by_user_id = ${reviewed ? reviewerId : tx`reviewed_by_user_id`},
        decision_note = coalesce(${input.decisionNote ?? null}, decision_note),
        decision_reason = coalesce(${input.decisionReason ?? null}, decision_reason),
        waitlist_until = ${input.decision === 'waitlisted' ? input.waitlistUntil ?? null : null},
        updated_by_user_id = ${reviewerId}
      where id_membership_application = ${applicationId}`;
    let membershipId: string | null = null;
    if (input.decision === 'approved') {
      const [current] = await tx<{ id_user_membership: string; id_membership_type: string }[]>`
        select id_user_membership, id_membership_type from user_memberships
        where id_user = ${app.id_user} and status = 'active' for update`;
      if (current?.id_membership_type === app.id_membership_type) throw conflict('already_member', 'User already holds this membership.');
      if (current) {
        await tx`update user_memberships set status = 'ended', end_date = greatest(current_date, start_date), updated_by_user_id = ${reviewerId}
          where id_user_membership = ${current.id_user_membership}`;
        await audit(tx, { actorUserId: reviewerId, action: 'membership.ended', entityType: 'membership',
          entityId: current.id_user_membership, reason: 'Replaced by approved application', source: 'admin_web' });
      }
      const [m] = await tx<{ id_user_membership: string }[]>`
        insert into user_memberships (id_user, id_membership_type, id_membership_application, status, start_date, end_date,
          approved_at, approved_by_user_id, source, created_by_user_id, updated_by_user_id)
        values (${app.id_user}, ${app.id_membership_type}, ${applicationId}, 'active', current_date,
          (current_date + make_interval(months => ${config.membershipPeriodMonths}) - interval '1 day')::date,
          now(), ${reviewerId}, 'application', ${reviewerId}, ${reviewerId})
        returning id_user_membership`;
      membershipId = m.id_user_membership;
      await tx`update user_acquisitions set converted_at = coalesce(converted_at, now()),
          conversion_type = coalesce(conversion_type, 'membership_approved')
        where id_user = ${app.id_user}`;
    }
    const action = { under_review: 'application.review_started', approved: 'membership.approve', waitlisted: 'application.waitlisted', declined: 'membership.reject' }[input.decision];
    await audit(tx, { actorUserId: reviewerId, action, entityType: 'membership_application', entityId: applicationId,
      changeData: { status: { old: app.status, new: input.decision } }, reason: input.decisionNote ?? null, source: 'admin_web',
      metadata: membershipId ? { id_user_membership: membershipId } : undefined });
    return { membershipId };
  });
}
