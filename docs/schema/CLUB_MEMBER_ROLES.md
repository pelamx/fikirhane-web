# CLUB_MEMBER_ROLES

## Purpose
Master dictionary of role types a user can hold inside a Club; the same list applies to every Club. One row = one club role definition (e.g. Member, Moderator, Club Lead). Centralizes role name, description, ordering, active/passive state, UI label, hierarchy, and future permission mapping. NOT stored here: which user holds which role (-> CLUB_USERS.ID_ClubMemberRole), permissions as boolean columns (-> future CLUB_MEMBER_ROLE_PERMISSIONS), global system roles (-> ROLES), organization roles (-> ORGANIZATION_ROLES), and "max lead per club" counts (business rule on CLUB_USERS).

## Final fields
| field | type | null? | default | FK | meaning / notes |
|---|---|---|---|---|---|
| ID_ClubMemberRole | uuid | NOT NULL | gen | PK | Unique, immutable. Example `cmr_001`. CLUB_USERS links via this. |
| role_code | text | NOT NULL | - | - | Technical stable code, UNIQUE (uppercase). |
| role_name | text | NOT NULL | - | - | UI display name. |
| description | text | NULL | - | - | What the role does. |
| role_rank | int | NULL | - | - | Simple hierarchy/order number; NOT a permission source. |
| is_management_role | bool | NOT NULL | (not stated; false sensible) | - | Whether role carries management function; for UI/filtering. |
| status | enum | NOT NULL | (not stated; `active` sensible) | - | |
| sort_order | int | NULL | - | - | UI ordering. |
| created_at | timestamptz | NOT NULL | now() | - | |
| created_by_user_id | uuid | NULL | - | USERS.ID_User | |
| updated_at | timestamptz | NOT NULL | now() | - | |
| updated_by_user_id | uuid | NULL | - | USERS.ID_User | |

## Enums / allowed values
- **status**: `active`, `inactive`, `archived`. Inactive role is not assigned to new Club Users but historical records are kept.
- **role_code**: `MEMBER`, `MODERATOR`, `CO_LEAD`, `CLUB_LEAD`, `SPONSOR_REPRESENTATIVE` (see seed).

## Constraints & indexes
- PK ID_ClubMemberRole (unique, immutable) — CMR-D01.
- UNIQUE(role_code) — CMR-D02.

## Relationships
- CLUB_MEMBER_ROLES 1:N CLUB_USERS (CLUB_USERS.ID_ClubMemberRole).
- Future: CLUB_MEMBER_ROLES 1:N CLUB_MEMBER_ROLE_PERMISSIONS N:1 PERMISSIONS (club-scope analogue of global ROLES/ROLE_PERMISSIONS).

## Business rules / data rules
1. CMR-D01: ID_ClubMemberRole unique and immutable.
2. CMR-D02: role_code unique.
3. CMR-D03: Inactive/archived role cannot be assigned to a new Club User.
4. CMR-D04: Role definition kept separate from actual club membership.
5. CMR-D05: Global system roles not stored here.
6. CMR-D06: Organization roles not stored here.
7. CMR-D07: role_rank must not be the sole source of authorization (only ordering/hierarchy, e.g. Club Lead above Co-Lead).
8. CMR-D08: Club role permissions, if needed, managed via a separate mapping table (CLUB_MEMBER_ROLE_PERMISSIONS).
9. "Max 1 active Club Lead per Club" is a business rule checked on CLUB_USERS, not defined in this table.
10. MEMBER is a valid club-context role (basic relation type in the club), distinct from global Fikirhane Membership.
11. SPONSOR_REPRESENTATIVE: persistent relation with the club but no automatic management rights.
12. When this table is used, CLUB_USERS.club_role enum is dropped in favor of the ID_ClubMemberRole FK.

## Superseded / rejected ideas
- CLUB_USERS.club_role plain enum — superseded by FK to this table.
- Boolean permission columns (can_edit_event, can_manage_members, can_view_analytics) — rejected.
- Authorization decided solely by role_rank — rejected.
- Storing max lead count here — rejected.

## Open questions
- CLUB_MEMBER_ROLE_PERMISSIONS is "later, if needed" — not decided for V1.
- role_rank for SPONSOR_REPRESENTATIVE not given.

## Example row
`ID_ClubMemberRole=cmr_004, role_code=CLUB_LEAD, role_name="Club Lead", description="Club'ın operasyonlarını yöneten ana kullanıcı rolü." (main user role managing club operations), role_rank=40, is_management_role=true, status=active, sort_order=40`

## Seed data
| role_code | role_name | is_management_role | role_rank | description (where given) |
|---|---|---|---|---|
| MEMBER | Member | false | 10 | |
| MODERATOR | Moderator | true | 20 | |
| CO_LEAD | Co-Lead | true | 30 | |
| CLUB_LEAD | Club Lead | true | 40 | Main user responsible for the club's operational management |
| SPONSOR_REPRESENTATIVE | Sponsor Representative | false | (not stated) | |

Possible future CLUB_MEMBER_ROLE_PERMISSIONS seed (example from doc):
- CLUB_LEAD -> `club.update`, `club_members.manage`, `event.create`, `event.update_details`
- MODERATOR -> `club_members.view`, `event_attendance.manage`
