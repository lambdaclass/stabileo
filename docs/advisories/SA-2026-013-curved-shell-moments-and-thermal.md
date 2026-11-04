# SA-2026-013: curved shells reported zero bending moments, and their stresses kept the free thermal strain

| | |
|---|---|
| Severity | High |
| Status | Published 2026-10-21 (fixed in 0.3.0; live on stabileo.com since 2026-10-21) |
| Issue | [#410](https://github.com/lambdaclass/stabileo/issues/410) (SH-6 in the element-derivation review) |
| Fix | PR [#522](https://github.com/lambdaclass/stabileo/pull/522) |
| Affected versions | every version with the curved-shell element, up to 0.2.0 and `main` until the fix; in the app, every version that solves a quad marked curved as a curved shell (from 2026-06-12) |
| Re-check registry | `curved-shell-moments-and-thermal` (models with curved shells) |

## Affected features

The degenerated-continuum curved shell (`curvedShells` in the engine input; in the app, a quad
marked as curved). Its centre results are returned in `quadStresses`. In the app they are read by:

- the shell contour plots in the viewport and in exported figures (mx, my, mxy, and the stress
  components);
- the Pro results tab's shell table and the Pro PDF report (σ, principal stresses, Von Mises,
  mx, my, mxy);
- the floor design's slab check (Wood–Armer moments), if a slab panel is a curved quad.

The shell tables of the results workbook and the CSV already left curved-shell moments blank.

## What was wrong

1. **Bending and twisting moments were reported as zero.** `curved_shell_stresses` computed only
   the mid-surface membrane stresses and returned mx = my = mxy = 0 whatever the deformation,
   which reads as "no bending".
2. **Stresses ignored the thermal strain.** Under a curved-shell temperature load
   (`curvedShellThermal`) the reported stresses kept the free thermal strain: σ = D·ε instead of
   σ = D·(ε − ε_th). A heated shell free to expand reported E·α·ΔT/(1−ν), and a restrained one
   reported nothing.
3. **In the app, a temperature load on a curved quad was not applied.** It was sent to the engine
   as a flat-quad temperature (`quadThermal`) with the curved shell's id; the engine accepted the
   id (it existed, as a curved shell) and the flat-quad assembly found no flat quad with it, so the
   shell was analysed unheated, without a warning.

| Documented case | Correct | Reported before the fix |
|---|---|---|
| Cantilever strip of four curved shells, 4 m × 1 m × 0.2 m, 10 kN at the tip: mx at the root element (x = 0.5 m) | 35.0 kN·m/m | 0 |
| Curved shell free to expand, steel (E = 200 GPa, ν = 0.3, α = 1·10⁻⁵ /°C), ΔT = +20 °C: σxx | 0 | 57.1 MPa |
| Same shell fully restrained: σxx | −57.1 MPa | 0 |

The moments were unconservative for any design read from them; the thermal stresses could be
reported where there are none, or missing where the restraint creates them.

Since 2026-10-20 results with curved shells carried the known-issue warning SH-6 ("do not design
from curved-shell moments or stresses"); the fix removes it.

## How to tell if your results are affected

Your model has curved shells (in the app, quads marked as curved) and you read their moments
(contours, the Pro results table or report, a slab design), or it has a temperature load on a
curved shell. Mechanical loads only: the membrane stresses were right, the moments were not.

## Fixed in

PR #522 (0.3.0). The moments are the in-plane stresses integrated through the thickness
(M = −∫σ·z dz by two-point Gauss quadrature in ζ, in the mid-surface frame; exact where the
strain is linear in ζ, as on a flat element; same sign as the flat MITC4). Stresses, moments and corner Von Mises come from the mechanical strain
ε − α·(ΔT + ζ·ΔTg/2), the free strain the thermal load vector uses, summed over every temperature
load on the element and taken per load case. The app sends a curved quad's temperature as
`curvedShellThermal`, and the engine now refuses a shell load that names an element of another
family instead of dropping it. Tests (`engine/tests/derivation_shells.rs`): a flat curved shell
reports the flat MITC4's bending and twisting moments to 1e-6; the cantilever strip reports
P·(L − x)/b; a free flat curved shell under a uniform ΔT, a gradient or two stacked
temperature loads reports zero stress and moment, and a free cylindrical or twisted one (varying
directors) a residual under 5 % of the restrained value, the element's discretization error, which
shrinks with the element (it was 100 %); restrained, −E·α·ΔT/(1−ν) and the gradient moment of the
flat MITC4; a quad temperature on a curved shell is refused.

## Workaround

Model the surface with flat quads (MITC4), whose moments and thermal stresses were right, or
recover moments from the reactions by statics.

## What to do with results you already have

Re-run models with curved shells on the fixed version and repeat any design or check that read
their moments, their stresses under temperature, or relied on a temperature on a curved quad
made in the app.

## Credits and references

Found by the element-derivation review (SH-6, PR #330) and pinned by
`sh6_curved_shell_reports_bending_moments`; the ignored app temperature load was found while
fixing it.
