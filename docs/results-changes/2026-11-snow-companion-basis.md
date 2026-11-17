# Flat-roof snow in companion combinations

Issue #2211 exposed a mismatch between the CIRSOC 101-2025 exception 2
note and the applied member loads. Strength combinations 2, 4 and 5
selected the ordinary roof snow patterns, including slope reduction,
instead of the flat-roof pressure pf required by that exception.

For the issue witness, the projected member length is 10 m, slope 20°,
tributary width 1 m, pg=1 and Ce=Ct=I=1, with a slippery roof. CIRSOC
104-2005 chapter 3 equation (1) gives pf=0.7. Chapter 4 Figure 2 gives
Cs=(70-20)/(70-5)=10/13. The physical balanced pressure is therefore
ps=7/13. The companion contribution in combination 2 changes from
0.5*(7/13)*10=2.692307692307692 kN to 0.5*0.7*10=3.5 kN.
The minimum in section 3.4 is evaluated for the actual roof geometry;
this does not pretend that the physical roof has zero slope.

A typed snowBasis term now survives native generation and WASM
transport. The planner materializes pf through the same projected
member-load path used by physical snow. The separate case contains
neither slope reduction, shaped patterns, drift nor sliding surcharge.
The applicable chapter 10 rain-on-snow supplement remains in this case.
Its interpretation survives apply, case matching and model persistence.
The companion-only case is not requested as a standalone solve; combinations
that reference it still obtain its member loading.
Every combination expansion selects the required interpretation and
refuses if it is unavailable. The exception note on legacy specifications
also requests the flat-roof interpretation, rather than silently retaining
the earlier mapping.

INPRES-CIRSOC 103 [3.16] still applies to physical roof snow. A distinct
seismic specification preserves f2*S alongside CIRSOC 101's 0.2*pf;
taking the larger scalar factor cannot replace these two different fields.
Automatic mass presets exclude the companion-only case. The load-plan
seismic weight continues to read the physical balanced case once.

The independent carrier oracle uses EA=EI=1, projected length 10 m and
rise 10*tan(slope). For a uniform projected pressure p and member length
L, the local axial intensity is -p*cos(slope)*sin(slope), and the transverse
intensity is -p*cos(slope)^2. At station s the axial force and shear are
the respective intensities times (L-s), and bending is transverse
intensity times (L-s)^2/2. Tip axial displacement is axial intensity
times L^2/2; tip deflection is transverse intensity times L^4/8.
Tests compare those values per carrier, through projected and width
inlets, rotations, mirroring, member reversal and subdivision. They check
both sides of the slope-factor and low-slope-minimum boundaries, and
retain the physical-pressure control. These are analytical member-load
checks upstream of the 2D/3D and linear/nonlinear solver selections;
they are not separate nonlinear solver validations.

A low-slope correct-input control uses pg=0.5 and Ce=1.1, with Ct=I=1.
Equation (1) gives 0.385, the minimum is 0.5, and chapter 10 gives
0.25-(0.5-0.385)=0.135 rain supplement below 2.4 degrees. Both physical
and companion fields therefore remain 0.635 below that boundary and 0.5
at or above it. This supplement must not be lost by separating the cases.

The existing snow snapshot corpus captures the physical cases, which
this change preserves. No historical snapshot baseline is changed.
Regenerate snow loads and combinations, then rerun analyses and checks.
Issue #2218 remains open: preserving its physical eccentric loading
requires distributed torque support and a geometric tributary partition;
this change does not claim that its transfer is corrected.

## Deliberate combination-5 expectation change in #2233 round 3

The native integration test previously asserted that combination `5` had a
single snow factor `max(0.2, f2) = 0.7`. That assertion describes the old
conflation of two snow fields; it is not a direct pressure or slope-factor
assertion. The split introduced by this results change is intentional.
The authoritative texts checked into this repository give the derivation:

- [CIRSOC 101-2025 §2.3.2](../codes/CIRSOC/markdown/cirsoc-101-2025/capitulo-2-combinaciones-de-carga.md),
  combination 5, specifies `1.2 D + 1.0 E + L + 0.2 S`.
  Exception 1 permits the live factor to be `0.5` when `Lo <= 5 kN/m²`,
  excluding garages and public assembly. Exception 2 requires the
  complementary snow in combinations 2, 4 and 5 to be flat-roof snow.
- [INPRES-CIRSOC 103-I §3.7.1](../codes/CIRSOC/markdown/inpres-cirsoc-103-i/capitulo-3-espectros-acciones-y-combinaciones-de.md),
  equation [3.16], specifies `1.20 D ± 1.00 E + f1 L + f2 S`.
  Table 3.3 supplies `f1 = 0.25` for the residential-use example and
  `f2 = 0.70` for roofs that retain snow; other snow cases use `0.20`.
- [CIRSOC 104-2005 chapter 3](../codes/CIRSOC/markdown/cirsoc-104-2005/capitulo-3-cargas-de-nieve-sobre-cubiertas.md),
  equation (1), defines `pf = 0.7 Ce Ct I pg`, subject to §3.4 minima.
  [Chapter 4](../codes/CIRSOC/markdown/cirsoc-104-2005/capitulo-4-cargas-de-nieve-sobre-cubiertas.md),
  equation (2), defines physical sloped-roof snow as `ps = Cs pf`,
  applied over the horizontal projection. Thus `pf` and physical `S`
  cannot generally share a scalar factor or case identity.

For the exact integration-test input (`Lo = 3`, no excluded occupancy,
`f1 = 0.25`, `f2 = 0.7`), the retained conservative live companion is
`max(0.5, 0.25) = 0.5`. The two generated specifications must be:

| Specification | Dead | Earthquake | Live | Snow member loading |
| --- | --- | --- | --- | --- |
| `5` | 1.2 D | 1.0 E | 0.5 L | 0.2 pf (`snowBasis: flatRoof`) |
| `5-seismic` | 1.2 D | 1.0 E | 0.5 L | 0.7 physical S (no flat-roof basis) |

Earthquake sense is expanded downstream. These are distinct specifications,
not additive snow terms. Both must survive even when `f2 = 0.2`: equality
of factors does not imply equality of member loading. When no `f2` is
supplied there is only the CIRSOC 101 snow specification; when snow is
absent neither specification may invent a snow term. The unchanged
combination `7` remains `0.9 D + 1.0 E`.

The revised native test asserts every serialized term, factor and snow basis
for both specifications. It also covers both published snow participation
factors, missing `f2`, both sides of the live-reduction boundary, the excluded
occupancy, a larger published `f1`, and snow-absent controls. The existing
WASM-backed load tests check case expansion and per-carrier member loading.
The two exact notice tests now include `snow-companion-basis` and
`snow-combination-validation`, retaining every existing main notice across
2D, 3D and Pro and linear, P-delta and plastic solve stamps.

This round changes tests and documentation only. The engine result change
remains registered by `snow-companion-basis.json`; the subsequent validation
change remains registered by `snow-combination-validation.json`. No result
snapshot, tolerance or engine implementation is changed in round 3.
