-- Floor plans for seat selection (SPACE_SETUPS.map_image / map_aspect_ratio, TABLES and SEATS positions, D-19: centers
-- normalized 0..1 over the whole plan image). Images live in the site under assets/plans/. Positions follow the
-- reference layout: per table two seats above and two below, numbered left to right (Fikirhane F01–F16, Atölye A01–A12).
update space_setups set map_image = 'assets/plans/fikirhane.png', map_aspect_ratio = 1.51 where setup_code = 'FIKIRHANE_COWORK_V1';
update space_setups set map_image = 'assets/plans/atolye.png', map_aspect_ratio = 1.93 where setup_code = 'ATOLYE_COWORK_V1';

update tables t set position_x = v.x, position_y = v.y, width = v.w, height = v.h
from (values
  ('FIKIRHANE_COWORK_V1', 'T01', 0.403, 0.210, 0.179, 0.116), ('FIKIRHANE_COWORK_V1', 'T02', 0.615, 0.210, 0.179, 0.116),
  ('FIKIRHANE_COWORK_V1', 'T03', 0.411, 0.783, 0.179, 0.116), ('FIKIRHANE_COWORK_V1', 'T04', 0.610, 0.783, 0.179, 0.116),
  ('ATOLYE_COWORK_V1', 'T01', 0.232, 0.405, 0.179, 0.207), ('ATOLYE_COWORK_V1', 'T02', 0.440, 0.405, 0.179, 0.207),
  ('ATOLYE_COWORK_V1', 'T03', 0.661, 0.405, 0.179, 0.207)
) as v(setup, code, x, y, w, h), space_setups s
where s.setup_code = v.setup and t.id_space_setup = s.id_space_setup and t.table_code = v.code;

-- Seat k (1..4) of a table, from its number: 1 top-left, 2 top-right, 3 bottom-left, 4 bottom-right.
update seats st set
  position_x = round(t.position_x + case when ((substr(st.seat_code, 2)::int - 1) % 4) + 1 in (1, 3) then -0.049 else 0.049 end, 3),
  position_y = round(t.position_y + case
    when s.setup_code = 'ATOLYE_COWORK_V1' then (case when ((substr(st.seat_code, 2)::int - 1) % 4) + 1 <= 2 then -0.190 else 0.179 end)
    else (case when ((substr(st.seat_code, 2)::int - 1) % 4) + 1 <= 2 then -0.118 else 0.114 end) end, 3),
  rotation = 0
from tables t join space_setups s using (id_space_setup)
where st.id_table = t.id_table and s.setup_code in ('FIKIRHANE_COWORK_V1', 'ATOLYE_COWORK_V1');
