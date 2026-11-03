### BREAKING (results)

#### The load generator keeps a floor's area loads when low roof structure stands over only part of it (2026-11-03)

- SA-2026-033: since #1076, "Generate loads from the code" left out a whole panel's dead, live
  and roof live area load when the only members found over it were less than 2.2 m above, even
  with open sky over the rest: a 6 × 6 m floor with one low beam over one edge lost all 36 m². A
  panel is now left out only when roof structure covers all of it under 2.2 m and a deck or
  beam under 2.2 m stands over its center, and the panels, members and shells loaded above carry
  all of it; otherwise it keeps its whole area load, as roof load. Trusses count as roof
  structure. Panels and members only partly under low structure keep their load, as floor load
  when a floor or roof stands over their center and as roof load otherwise, and are named in the
  derivation. Generate the loads again for models whose loads came from the generator.
