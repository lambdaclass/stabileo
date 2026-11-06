### BREAKING (results)

#### The load generator keeps a floor's area loads when low roof structure stands over only part of it (2026-11-03)

- SA-2026-033: since #1076, "Generate loads from the code" left out a whole panel's dead, live
  and roof live area load when the only members found over it were less than 2.2 m above, even
  with open sky over the rest: a 6 × 6 m floor with one low beam over one edge lost all 36 m². A
  panel is now left out only when roof structure covers all of it under 2.2 m and a deck or
  beam under 2.2 m stands over its center, and the panels, members and shells loaded above carry
  all of it; otherwise the part they do not carry stays on it as roof load. Trusses count as roof
  structure. Panels and members only partly under low structure keep all their load, as floor
  load when a floor or roof stands over their center and as roof load otherwise; where a low
  member over them also carries its strip, that strip is loaded twice, and the derivation names
  them and asks for a check. Generate the loads again for models whose loads came from the generator.
- SA-2026-033 (#1311): the generator sized a panel by its bounding box in the plan's X and Y, so a
  3 × 20 m deck turned 45° lost all 60 m² of its floor load as "too wide for a slab". A panel is
  now too wide only when its narrowest width across any direction passes 12 m.
- SA-2026-033 (#1312): by width, the floor beams under low eaves keep their floor load.
- SA-2026-033: the part of a panel or member strip that the low structure above does not carry is
  now found exactly, not by a grid that counted any partly carried cell as uncarried (a 0.05 m gap
  between two beam strips kept 1.8 m² instead of 0.3 m²).
- SA-2026-033: whether roof structure lies over a panel is now probed along the panel's own sides,
  not the plan's X and Y, so a shallow trussed roof turned 45° is no longer loaded as a floor.
- The re-check notice for this change stays until the loads are generated again. Solving again no
  longer clears it, because saved loads do not change. Applying a load plan now records the results
  version it was generated with.
