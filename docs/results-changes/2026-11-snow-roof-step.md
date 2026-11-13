# Snow on lower roofs at modeled steps (2026-11-13)

Issue #2082, integration #2081; [SA-2026-065](../advisories/SA-2026-065-snow-drift-roof-step.md).

CIRSOC 104 step drift previously used a flat-roof snow depth and the difference
between level panel outlines. A lower pitched roof needs its own balanced snow
depth after the slope factor and the height of the upper surface above its own
surface at each position along the shared edge. An eave-level comparison can
omit required drift, apply the wrong cap or width, or apply drift where the roof
has risen into the clear height. Matching surcharge bands to one average member
elevation can also omit sliding snow from a pitched receiver.

The shared roof-surface reader supplies both panel slopes and local elevations.
It keeps a higher roof's rafters out of the receiving panel's slope. The shared
step reader identifies each overlapping edge independently, including rotated
edges and several steps. CIRSOC's one drift path now takes a balanced-pressure
reader indexed by the receiving panel, evaluates clear height locally, and
attaches bands to receiving panels rather than one global elevation. Width
members are tested at their actual elevation at each sampling position.

The retained gable witness has 20° slopes, a 1 m eave-to-ridge plan distance,
and an adjoining flat roof 0.45 m above its eave. With the inputs in the
[reproducer](../../web/src/lib/engine/loads/__tests__/snow-drift-audit.test.ts),
CIRSOC's low-slope minimum gives pf = 1 kN/m², Cs = (70 − 20)/65 and
ps = 0.7692307692307693 kN/m². Equation (4) gives γ = 0.426 × 1 + 2.2
= 2.626 kN/m³. Therefore hb = ps/γ = 0.29292870115413905 m and
hc = 0.45 − hb = 0.15707129884586096 m. hc/hb exceeds 0.2.
The retained Figure 9 ordinate hd = 0.381 m exceeds hc, so the local
balanced-plus-drift peak is ps + γ hc = γ × 0.45 = **1.1817 kN/m²**.
The ordinate is the existing vector-path reading; this change does not
independently redigitize Figure 9. The peak depends only on hd exceeding hc.

Main's original generator produced 1 kN/m² with no drift. Before this repair,
the integration produced ps but still omitted drift. The active regressions
check the hand-derived peak from a loaded interior probe and the local
triangle width, plus both sides of hc/hb = 0.2, hd above/below hc, flat/pitched
receivers, mixed roofs in both orders, multiple steps, rotation and sliding.
The tests also exercise both the direct generator and the load-plan adapter.
This is a TypeScript load-generation correction before any structural solve;
there is no separate native/WASM, linear/nonlinear or planar/spatial drift
implementation to patch. All solvers consume the generated loads.

ASCE 7 §7.7, Eurocode step coefficients μ2/μ3 and TS 498 drift/sliding remain
unimplemented by their adapters. Modeled-step tests retain their explicit
omission warnings, including the UK Eurocode variant. This change does not
supply those omitted code cases. Existing no-step slope/pressure controls and
flat-step controls remain checked; no numerical tolerance or baseline changes.

The `snow-lower-roof-step` registry entry selects actual generated snow carriers
on lower roofs at modeled steps, including width carriers. Manual loads,
generated dead loads, higher-roof-only snow and roofs without modeled steps
are excluded. A new structural solve with stale generated snow retains the
notice: regenerate the snow first, then solve and review derived demands and
deliverables. Independently supply omitted drift/sliding code cases.
