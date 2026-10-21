# USER_ACQUISITIONS

## Purpose
Attribution table: one row = the primary / first-touch acquisition snapshot of one User — the first identifiable source, channel, campaign, invitation, freepass or referral through which the User came to Fikirhane. Answers "where did this user first find us / via which acquisition flow did they arrive?". User-level historical property, fixed once the user is created.
NOT stored here: booking channel (-> BOOKINGS.booking_source, a transaction-level property); freepass distribution channel (-> FREEPASSES.distribution_source); first paid booking (derived from BOOKINGS + DOCUMENT_ITEMS); revenue, LTV, CAC, booking count, conversion rates (derived in analytics); all touchpoints (would be a future USER_TOUCHPOINTS system); anonymous visitor tracking (anonymous_session_id, cookie_id, analytics_event — separate analytics infrastructure, not needed in V1).

## Final fields
Final ("nihai sade") V1 field set:

| field | type | null? | default | FK | meaning / notes |
|---|---|---|---|---|---|
| ID_UserAcquisition | uuid | NOT NULL | generated | PK | Doc example `uacq_10001`. |
| ID_User | uuid | NOT NULL | | USERS.ID_User | Acquired user. Core field. |
| source | enum / text | NOT NULL | | | Main acquisition source (controlled values). Core field. |
| medium | text | NULL | | | Communication/distribution type of the source (classic attribution). Core field. |
| ID_Campaign | uuid | NULL | | CAMPAIGNS.ID_Campaign | If acquired via a campaign. Core field. |
| ID_Invitation | uuid | NULL | | INVITATIONS.ID_Invitation | If arrived via an invitation. Core field. |
| ID_Freepass | uuid | NULL | | FREEPASSES.ID_Freepass | If entered by claiming a freepass. Core field. |
| referrer_user_id | uuid | NULL | | USERS.ID_User | Existing user who brought them (Bring a Guest/referral). Derivable from invitation but snapshotted for reporting. Core field. |
| referrer_organization_id | uuid | NULL | | ORGANIZATIONS.ID_Organization | Referring organization (university / corporate / gym partner / sponsor). |
| landing_source | text | NULL | | | Physical/digital entry point (e.g. `kabatas_qr_poster`, `bau_partner_page`, `instagram_bio`, `linkedin_post`, `karakoy_gym_card`); esp. useful for physical partner distribution. |
| utm_source | text | NULL | | | Digital attribution source. |
| utm_medium | text | NULL | | | Digital medium. |
| utm_campaign | text | NULL | | | UTM campaign. |
| utm_content | text | NULL | | | Ad/content variant. |
| utm_term | text | NULL | | | Keyword etc. |
| first_touch_at | timestamptz | NULL | | | First measurable contact with Fikirhane; may precede account creation. Core field. |
| converted_at | timestamptz | NULL | | | When user counted as "acquired" in the funnel (definition per conversion_type). |
| conversion_type | enum | NULL | | | Which event counted as acquisition conversion. Optional in V1 if only attribution is kept. |
| notes | text | NULL | | | Internal note. |
| created_at | timestamptz | NOT NULL | now() | | |
| created_by_user_id | uuid | NULL | | USERS.ID_User | Creating user / NULL for system. |
| updated_at | timestamptz | NOT NULL | now() | | |
| updated_by_user_id | uuid | NULL | | USERS.ID_User | |

## Enums / allowed values
- source: `organic`, `instagram`, `linkedin`, `google`, `email`, `referral`, `invitation`, `freepass`, `partner`, `university`, `corporate`, `walk_in`, `event`, `other`
- medium (examples): `organic_social`, `paid_social`, `email`, `referral`, `qr`, `physical_card`, `partner`, `organic_search`, `paid_search`, `direct` (doc example row also uses `member_referral`)
- conversion_type: `account_created`, `first_booking`, `first_attendance`, `first_paid_booking`, `membership` (section 16 lists the candidate conversion definitions as `account_created`, `first_booking`, `first_attendance`, `first_paid_booking`, `membership_approved`)

## Constraints & indexes
- PK ID_UserAcquisition.
- FK ID_User NOT NULL.
- UNIQUE(ID_User) — V1: max one primary acquisition record per user (UACQ-D02).
- ID_Campaign, ID_Invitation, ID_Freepass all optional; may be filled simultaneously (Campaign -> Freepass -> User acquisition is normal).

## Relationships
- USERS 1 — 1 (0..1) USER_ACQUISITIONS (V1, Model A).
- CAMPAIGNS 1 — N USER_ACQUISITIONS; INVITATIONS 1 — N; FREEPASSES 1 — N.
- USERS 1 — N USER_ACQUISITIONS as referrer; ORGANIZATIONS 1 — N as referrer.
- Funnel: CAMPAIGN/SOURCE -> USER_ACQUISITION -> USER -> BOOKINGS -> ATTENDANCE -> PAID BOOKING -> MEMBERSHIP (this table holds only the starting attribution).

## Business rules / data rules
1. UACQ-D01: Every UserAcquisition must reference a valid User.
2. UACQ-D02: V1: max one primary UserAcquisition per User.
3. UACQ-D03: Acquisition source and Booking source must not be used as the same concept (e.g. acquisition = instagram, later booking_source = mobile_app is normal).
4. UACQ-D04: Campaign, Invitation and Freepass FKs are optional.
5. UACQ-D05: Acquisition attribution is preserved as a historical snapshot once the user is created (does not change with later bookings).
6. UACQ-D06: Attribution changes must be audited (admin may correct wrong attribution; "source changed" goes to AUDIT_LOG because it affects marketing KPIs).
7. UACQ-D07: Revenue, LTV, booking count, conversion rate etc. must not be stored here as source of truth (no `revenue`, `ltv` columns).
8. UACQ-D08: UTM values must be normalized and snapshotted at account/conversion time.
9. UACQ-D09: If a referrer User or Organization exists, use the FK; free text only as fallback.
10. Attribution rule V1: first identifiable acquisition source (first-touch). E.g. saw Instagram ad -> got freepass -> came back via Google 3 days later -> opened account => acquisition stays Instagram.
11. Do not confuse source and medium (source=instagram/medium=paid_social; source=google/medium=organic_search).
12. Campaign alone is not sufficient attribution: same campaign can bring users from different sources (Launch Freepass via instagram/paid_social vs university/partner).
13. Freepass distribution_source represents the entitlement's distribution; UserAcquisition represents how the person was acquired (e.g. freepass distribution_source = university_partner, acquisition source = university, ID_Freepass = fp_123).
14. converted_at should NOT default to account creation (account opening is not a commercial conversion); more useful default is first_attendance or first_booking. The analytics definition must be documented separately.
15. Invitation-based arrival: e.g. Ahmet's Bring a Guest -> Mehmet: source = referral, ID_Invitation = inv_123, referrer_user_id = Ahmet.
16. Table is meaningful only after a User exists.
17. Purpose: show which channels (Instagram, LinkedIn, email, physical partner, university, gym/company, referral) convert into paid users; funnel reports like "University partner: 100 acquired, 65 attended, 28 paid, 10 became Member".

## Superseded / rejected ideas
- Storing acquisition info on BOOKINGS — rejected (true source gets lost).
- Model B: N touchpoint records per user (USER_TOUCHPOINTS / full attribution system) — rejected for V1.
- Last-touch attribution — rejected; first identifiable source chosen.
- first_paid_booking_id column — rejected (derived).
- revenue / ltv / CAC columns — rejected (derived in analytics).
- Anonymous visitor tracking fields (anonymous_session_id, cookie_id, analytics_event) — out of scope V1.
- converted_at tied to account creation — discouraged.

## Open questions
- Default/official conversion definition (first_attendance vs first_booking) — to be documented in analytics.
- conversion_type value `membership` vs `membership_approved` naming.
- Whether to keep conversion_type in V1 (optional if only attribution).
- When to use source = `invitation` vs `referral` for invitation-based arrivals (example uses `referral`).
- medium as controlled enum vs free text (`member_referral` used in example but not in list).

## Example row
Instagram Freepass: ID_UserAcquisition=uacq_10001, ID_User=usr_AYSE, source=instagram, medium=paid_social, ID_Campaign=camp_LAUNCH_FREEPASS_2026, ID_Invitation=NULL, ID_Freepass=fp_10001, referrer_user_id=NULL, referrer_organization_id=NULL, landing_source=instagram_story_ad, utm_source=instagram, utm_medium=paid_social, utm_campaign=launch_freepass_oct_2026, utm_content=story_video_a, utm_term=NULL, first_touch_at=2026-10-02 18:20, converted_at=2026-10-02 18:28, conversion_type=account_created, notes=NULL, created_at=2026-10-02 18:28, created_by_user_id=NULL
Bring a Guest: ID_User=usr_MEHMET, source=referral, medium=member_referral, ID_Campaign=camp_BRING_GUEST, ID_Invitation=inv_10023, ID_Freepass=fp_10023, referrer_user_id=usr_AHMET, first_touch_at=2026-10-04 13:10
