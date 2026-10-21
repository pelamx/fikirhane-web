import QRCode from 'qrcode';
import type { Config } from '../config.ts';
import type { Db } from '../db.ts';
import { ApiError, notFound } from '../errors.ts';

/**
 * Entry pass (QR) of a booking. The QR carries an unguessable token plus the date and session window in readable form;
 * the server always re-reads the booking, so a pass is only accepted for its own session, from a few minutes before the
 * start until the end.
 */

const TZ = 'Europe/Istanbul';
const part = (d: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, ...opts }).format(d);
const isoDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const hm = (d: Date) => part(d, { hour: '2-digit', minute: '2-digit' });

interface PassRow {
  id_booking: string; id_event: string; id_user: string | null; checkin_token: string; booking_status: string; checkin_at: Date | null;
  start_datetime: Date; end_datetime: Date; event_title: string; location_name: string; seat_code: string | null; seat_name: string | null;
  table_name: string | null; first_name: string | null; last_name: string | null; guest_first_name: string | null; guest_last_name: string | null;
}

async function load(db: Db, where: { id?: string; token?: string }): Promise<PassRow | null> {
  const [row] = await db<PassRow[]>`
    select b.id_booking, b.id_event, b.id_user, b.checkin_token, b.booking_status, b.checkin_at, e.start_datetime, e.end_datetime,
           e.event_title, l.location_name, s.seat_code, s.seat_name, t.table_name, u.first_name, u.last_name,
           b.guest_first_name, b.guest_last_name
    from bookings b join events e using (id_event) join event_options o using (id_event_option)
    join locations l on l.id_location = o.id_location
    left join seats s on s.id_seat = b.id_seat left join tables t on t.id_table = b.id_table left join users u on u.id_user = b.id_user
    where ${where.id ? db`b.id_booking = ${where.id}` : db`b.checkin_token = ${where.token ?? ''}`}`;
  return row ?? null;
}
export const passById = (db: Db, id: string) => load(db, { id });
export const passByToken = (db: Db, token: string) => load(db, { token });

export function windowOf(row: PassRow, config: Config) {
  return { opens: new Date(row.start_datetime.getTime() - config.checkinEarlyMinutes * 60_000), closes: row.end_datetime };
}

/** What the QR encodes: the staff check page with the token, plus date and session for anyone reading it. */
export function qrText(row: PassRow, base: string) {
  const session = `${hm(row.start_datetime)}-${hm(row.end_datetime)}`;
  return `${base}/admin/#kontrol?k=${row.checkin_token}&tarih=${isoDay(row.start_datetime)}&seans=${encodeURIComponent(session)}`;
}

export function passInfo(row: PassRow, config: Config) {
  const { opens, closes } = windowOf(row, config);
  return {
    id_booking: row.id_booking, id_event: row.id_event, status: row.booking_status, event_title: row.event_title,
    date: isoDay(row.start_datetime), date_label: part(row.start_datetime, { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }),
    session: `${hm(row.start_datetime)}–${hm(row.end_datetime)}`, location: row.location_name,
    seat: row.seat_code ? `${row.table_name ? row.table_name + ' · ' : ''}Koltuk ${Number(row.seat_code.replace(/\D/g, '')) || row.seat_code}` : row.table_name,
    holder: [row.first_name ?? row.guest_first_name, row.last_name ?? row.guest_last_name].filter(Boolean).join(' '),
    valid_from: opens.toISOString(), valid_until: closes.toISOString(), checked_in_at: row.checkin_at?.toISOString() ?? null,
  };
}

const PASS_STATUSES = new Set(['confirmed', 'checked_in']);

/** Whether this pass opens the door right now; the reason is shown to staff when it does not. */
export function verdict(row: PassRow, config: Config, now = new Date()) {
  const { opens, closes } = windowOf(row, config);
  const when = `${part(row.start_datetime, { day: 'numeric', month: 'long' })} ${hm(row.start_datetime)}–${hm(row.end_datetime)}`;
  if (row.booking_status === 'checked_in') return { ok: false, code: 'already_checked_in', message: `Giriş zaten yapıldı (${row.checkin_at ? hm(row.checkin_at) : ''}).` };
  if (!PASS_STATUSES.has(row.booking_status)) {
    const why = row.booking_status === 'waitlisted' ? 'bekleme listesinde' : row.booking_status === 'pending_payment' ? 'ödeme bekliyor' : 'geçerli değil';
    return { ok: false, code: 'pass_not_valid', message: `Bu rezervasyon ${why}.` };
  }
  if (now < opens) return { ok: false, code: 'pass_too_early', message: `Bu QR ${when} seansı için. Giriş ${part(opens, { day: 'numeric', month: 'long' })} ${hm(opens)}'den itibaren.` };
  if (now > closes) return { ok: false, code: 'pass_expired', message: `Bu QR ${when} seansı içindi; seans sona erdi.` };
  return { ok: true, code: 'ok', message: `${when} seansı için geçerli.` };
}

export async function ownPass(db: Db, userId: string, bookingId: string) {
  const row = await passById(db, bookingId);
  if (!row || row.id_user !== userId) throw notFound('Booking');
  if (!PASS_STATUSES.has(row.booking_status)) throw new ApiError(409, 'pass_not_valid', 'Only confirmed bookings have an entry pass.');
  return row;
}

export const qrSvg = (text: string) =>
  QRCode.toString(text, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#29251e', light: '#ffffff' } });
export const qrPng = (text: string) =>
  QRCode.toBuffer(text, { type: 'png', margin: 3, width: 720, errorCorrectionLevel: 'M', color: { dark: '#29251e', light: '#ffffff' } });

/** e.g. fikirhane-qr-2026-10-22-10.00-14.00.png */
export const pngName = (row: PassRow) =>
  `fikirhane-qr-${isoDay(row.start_datetime)}-${hm(row.start_datetime).replace(':', '.')}-${hm(row.end_datetime).replace(':', '.')}.png`;
