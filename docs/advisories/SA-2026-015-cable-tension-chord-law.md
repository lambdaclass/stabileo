# SA-2026-015: cable analysis gave cables with self-weight too little tension in statically indeterminate structures

| | |
|---|---|
| Severity | High |
| Status | Published 2026-10-21 (fixed in 0.3.0; live on stabileo.com since 2026-10-21) |
| Issue | [#416](https://github.com/lambdaclass/stabileo/issues/416) (SP-12 in the element-derivation review); [#415](https://github.com/lambdaclass/stabileo/issues/415) (SP-11) fixed with it |
| Fix | PR [#525](https://github.com/lambdaclass/stabileo/pull/525) |
| Affected versions | every version with the cable solver, up to 0.2.0 and `main` until the fix |
| Re-check registry | entry `cable-tension-chord-law` (models with members) |

## Affected features

The cable analysis (`solve_cable_2d` / `_3d`), and through it, in the app, **every 3D solve of a
model with a member whose behaviour is set to "cable"** (`member-behaviour.ts` sends those models to
`solveCable3D`), when the cable's material has a density. Only the sag of a cable's own weight was
mis-modelled: a cable whose material has no density followed the taut-string law, which was and is
right (the fix changes its results only at second order, see below).

## What was wrong

A cable with weight sags; how much tension it carries for a given distance between its ends follows
the elastic-catenary chord law. With the unstressed length equal to the chord as modelled,

ε = T/EA − (w·l_h)²/(24·T²)

(ε the chord strain, w the weight per metre, l_h the horizontal projection). The solver used Ernst's
modulus, which is the *tangent* of that law, as a *secant* from the straight chord:
T = E_eq(T)·A·ε, i.e. ε = T/EA + (w·l_h)²/(12·T²). That law has the sag term with the wrong sign
and twice its size: it says a chord stretched by a given amount needs **less** tension than EA·ε,
when sag takes up chord length and it needs **more**.

Where equilibrium alone fixes the cable force (statically determinate cables) the tension was right
and only the displacements were off. Where the cable shares the load with other members (a guyed
mast, a cable braced by a frame, cable nets), **the cable got too little tension and the members
next to it too much**, and the fixed-point iteration often oscillated or did not converge:

| Guyed mast: 20 m mast (I = 2·10⁻³ m⁴) fixed at the base, steel guy of 1 cm² to an anchor 20 m out | Correct | Before the fix |
|---|---|---|
| Guy tension, 5 kN at the top | 5.18 kN | 4.34 kN (16 % low, 28 iterations) |
| Mast base moment, 5 kN at the top | 26.7 kN·m | 38.6 kN·m |
| Guy tension, 2 kN at the top | 2.76 kN | not converged (0 kN in the last iteration) |
| Horizontal steel cable 50 m, 1 cm², with a 20 kN/m spring, 10 kN (`cable_tension_follows_the_elastic_catenary_chord_law`) | 9.588 kN | 9.390 kN |

"Correct" is the closed form: the mast condensed to its top (3EI/L³ sideways, EA/L axially), the
chord law solved by bisection; the engine now agrees with it to 10⁻⁴ (the residual is the
deformed-chord strain it uses).

The helper `ernst_tangent_modulus` (SP-11) returned E(1 + α(1 − 3α/(1+α)))/(1+α)², not the
derivative of the chord law, and negative for moderate α. No solver used it.

## How to tell if your results are affected

Your model has a member with the "cable" behaviour, its material has a density, and the cable is not
the only path for the load (another member, a spring or a second cable shares it). The larger the
cable's weight relative to its tension (long, light, lightly loaded cables), the larger the error. An
app result that carried the "cables did not converge" note is affected.

## Fixed in

#525, released in 0.3.0. The cable solve now runs Newton on the chord law
itself: each pass assembles Ernst's modulus as the tangent and puts the rest of the linearised law
on the right-hand side as nodal forces, so the converged state satisfies the chord law exactly,
whatever the tangent. Reactions balance the reported tensions. `ernst_tangent_modulus` returns the
derivative (Ernst's modulus).

Two consequences to know:

- The unstressed length is still the modelled chord. A cable with weight therefore hangs at a
  tension T₀ with T₀³ = EA·(w·l_h)²/24 even with no load (that is the tension at which a cable
  exactly as long as its chord sags), and a cable with weight whose chord shortens keeps a small
  tension instead of going exactly slack. There is no pretension or unstressed-length input yet.
  For light cables T₀ is a few kN (a 20 m guy of 1 cm²: 2.7 kN, the tension of a guy erected taut
  with a sag of about 1/140 of its span); for heavy members modelled as cables it is large, and it
  is a self-stress the rest of the structure carries. Example: a tripod of three cables with the
  area of an IPN 300 (6.9 cm²) hanging a hub, plus a vertical tie from the hub to the ground that the
  load compresses: before the fix the tie went slack; now the three legs hang at T₀ ≈ 85 kN and pull
  the hub up, and the tie carries 74 kN with the ground support taking that as uplift
  (`web/src/lib/engine/__tests__/cable-behaviour.test.ts`). Model heavy members as trusses, not
  cables, until an unstressed-length input exists.
- Convergence: the app's "the cables did not converge" note came from the old fixed-point
  iteration oscillating; Newton on the chord law converges where it used to oscillate (the column
  with a head tie in the same test file), and convergence now also requires the solved system's
  cable forces to match the chord law and a reactivated slack cable to be solved with its stiffness.
- Cables without density: the solved system now balances the tension of the deformed chord, as
  reported, instead of its small-displacement value; the difference is second order (rotation
  squared over strain).

Tests: `derivation_special_elements.rs` — `cable_tension_follows_the_elastic_catenary_chord_law`,
`cable_tension_follows_the_chord_law_in_3d`, `guyed_mast_cable_tension_matches_the_chord_law`,
`weightless_cable_and_spring_share_by_stiffness`, `unloaded_heavy_cable_hangs_at_the_chord_law_tension`,
`cable_chord_tension_is_robust`,
`ernst_tangent_modulus_is_the_chord_law_derivative`; the statics tests in `cable_statics.rs` still
pass (determinate tensions unchanged).

## Workaround

Check the governing cable and anchorage forces by hand or with the cable's weight left out (no
density on its material): without weight the law was right.

## What to do with results you already have

Re-run models with cable members whose material has a density and compare the cable, anchorage and
adjacent-member forces. Cable tensions go up; forces in the members that shared the load with the
cable usually go down.

## Credits and references

Found by the element-derivation review (SP-11, SP-12, PR #330). H. M. Irvine, *Cable Structures*
(1981), ch. 2–3; J. H. Ernst, "Der E-Modul von Seilen unter Berücksichtigung des Durchhanges",
*Der Bauingenieur* 40 (1965).
