-- Seat selection is open to everyone, as on fikirhane.co/ng/rezervasyon (business decision, 2026-10-21; supersedes the
-- Premium-only seat selection of C-01). Visitors get the same right through VISITOR_SEAT_SELECTION (default true).
update membership_types set seat_selection_enabled = true where seat_selection_enabled = false;
