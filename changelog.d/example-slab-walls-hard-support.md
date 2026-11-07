### BREAKING (results)

#### The slab example on walls is compared with the series for the plate it solves (2026-11-07)

Only the website's slab-on-columns example changed; a saved model gives the same numbers as before.
On walls it held only the vertical displacement of the edges (soft simple support), and the
Reissner–Mindlin shell element solved that plate correctly. The page showed it beside Navier's
thin-plate series for a hard simply supported plate, so a thick slab showed up to a 6.4%
"difference" that came from the reference, not the engine. The walls now also hold the rotation
along each edge (hard simple support). The reference is now the Navier series of that plate with
its transverse shear term (κ = 5/6; Reddy 2007, Wang, Reddy & Lee 2000). The engine approaches it
within 0.6% on the example's mesh and within 0.01% on a fine one. The 2% tolerance is unchanged.

### Fixed

- The slab example on walls compared a soft-supported plate with the hard-support Navier solution
  and showed up to a 6.4% "difference" that came from the reference, not the engine. The walls
  now hold the edge rotations, and the reference includes the plate's transverse shear.
