-- Plans: the paid membership types are shown as Basic (MEMBER) and Plus (PREMIUM); the codes stay, so existing memberships,
-- applications and bookings keep pointing at the same rows. Plus adds a monthly guest right: once a month the member brings a
-- friend for free, either by adding the friend to their own booking or by handing over a code the friend books with.

alter table membership_types add column monthly_guest_passes int not null default 0 check (monthly_guest_passes >= 0);

update membership_types set membership_type_name = 'Basic', monthly_guest_passes = 0,
  description = 'Fikirhane Basic: üye indirimi, bir hafta önceden rezervasyon, aynı anda iki rezervasyon.'
  where membership_type_code = 'MEMBER';
update membership_types set membership_type_name = 'Plus', monthly_guest_passes = 1,
  description = 'Fikirhane Plus: daha yüksek indirim, iki hafta önceden ve aynı anda dört rezervasyon, her ay bir arkadaşınla ücretsiz gelme hakkı.'
  where membership_type_code = 'PREMIUM';

-- A plan's monthly guest right is a freepass of type guest that belongs to the member who holds the plan (granted_to_user_id),
-- valid for one calendar month in Istanbul time. id_user stays empty: the member or the friend using it is recorded per booking
-- in freepass_redemptions, so a right returned by a timely cancellation can be given to someone else.
alter table freepasses add column granted_to_user_id uuid references users;
create unique index freepasses_monthly_guest_uq on freepasses (granted_to_user_id, valid_from)
  where granted_to_user_id is not null and freepass_type = 'guest';
