# Transient amplification of broken symmetry in elastic snap-through (Wang, …, Vella 2024)

Research, not a design tool. Interactive page at `/research/mechanics/vella-2024`.

Q. Wang, A. Giudici, W. Huang, Y. Wang, M. Liu, S. Tawfick, D. Vella, *Transient amplification of
broken symmetry in elastic snap-through*, Phys. Rev. Lett. **132**, 267201 (2024),
doi:[10.1103/PhysRevLett.132.267201](https://doi.org/10.1103/PhysRevLett.132.267201). Read from
arXiv:2312.13908v2 with its Supplemental Material (25 pages). Every value we take from it, with its
page, the paper's own inconsistencies and our assumptions are in
[`reference/paper-extraction.md`](reference/paper-extraction.md).

## What existed and what was missing

| Need | In Stabileo before this crate | Used here |
|---|---|---|
| Geometrically exact planar beam | production 2D co-rotational frame (Crisfield B-matrix), `assemble_corotational_public` | yes, unchanged, for every internal force and tangent |
| Static path through limit points | production arc-length `solve_arc_length_from` (loads and prescribed support motion from a start state); `solve_corotational_2d_from` | yes, for both static paths |
| Stability of an equilibrium | engine `linalg` (Cholesky, LU, Jacobi); no symmetric/antisymmetric split | split and inertia count written here |
| Nonlinear implicit dynamics | **missing**: `solver::time_integration` is linear (constant K, Newmark/HHT); research crates have none (`benchmarks/newmark-1959` is the linear SDOF) | **written here** |
| Consistent mass under large rotation | `frame_consistent_mass` is the Hermite mass in local axes, which depends on the element's orientation | a configuration-independent mass written here |
| Elastica with clamps at an angle | `stability/feher-sipos-varkonyi-2026` (quasi-static strip on the same element) | same model idea, own code |

The engine and its numerics are not modified. The missing piece, an implicit nonlinear integrator,
fits inside the crate (about 700 lines of `src/dynamics.rs`) and works on the production element; it
is written so that it could move to the product through the product's process. The research rules
allow depending on stable engine APIs; nothing in the engine or app imports this crate.

**A finding for the engine owners.** The production arc-length and co-rotational solvers converge
relative to a scale set by the axial stiffness. On this strip (EA·L²/EI = 5.4 × 10⁷) their states
carry residuals up to 10⁻² EI/L² near the fold and the asymmetric bifurcation, enough to move µ* in
the fourth digit and, at 96 elements, to make a fixed-load Newton converge to non-equilibria. Every
equilibrium used here is therefore re-converged on the mirror-symmetric subspace with the midpoint
height as control (`statics::at_height`), to 10⁻¹⁰ + 2 × 10⁻¹⁴ EA (about ten times the round-off
floor of the internal force).

## Model

- Strip of unit length, EI = 1, ρA = 1; time in t* = L²√(ρA/EI) (Eq. S5); EA·L²/EI = 12(L/h)² with
  L/h = 108/0.0508 (the paper's simulated strip, SM p. 12). 48 elements by default. The engine takes the material modulus in MPa and assembles it in kN/m². With I = 1, the input modulus for unit EI is 0.001 MPa.
- Clamps: both ends fixed in z, rotated to ±α (anticlockwise tangent +α on the left), moved in x.
  µ = ΔL/(α²L) (Eq. 1).
- Natural state: turn the clamps with the right end sliding, then move both ends to ±ΔL/2
  (production `solve_corotational_2d_from`).
- Inverted state: a downward midpoint load traced by production arc-length from the natural state
  through its limit point, until the load returns to zero on the inverted side; the arc-length
  constraint mixes displacements with loads, so EI is scaled by 0.005 on that path (shapes do not
  depend on it).
- Inverted branch: production arc-length on the end-shortening brackets µ_A and the fold. The
  curves drawn in the diagram (natural branch, inverted branch, load path) are equilibria at
  midpoint heights fixed in advance (steps of 0.002α; 0.01α on the load path), each converged by
  `statics::at_height` from the previous one. The arc-length's adaptive steps, and its direction
  test past the fold, follow Newton iteration counts that round-off changes between platforms: on
  Linux CI the inverted path ran on to µ = 0.6 where on macOS it turned back at µ ≈ 0.39. Points
  at fixed heights differ between platforms by round-off only, so they can be stored as evidence.
- µ_A: bisection on the midpoint height for the sign change of the antisymmetric tangent
  (Sylvester's inertia of an LDLᵀ); µ*: golden-section search for the least shortening along the
  branch parametrised by the midpoint height. Their heights are stored in αL, the unit of the
  diagram's branches, and `validate` checks them against the heights where the drawn branch's
  antisymmetric and symmetric ω² cross zero.
- Spectra: the tangent projected on the mirror-symmetric and antisymmetric free DOFs; ω² from
  K φ = ω² M φ with the rotations condensed (no rotary inertia, as the paper's beam equation S2).
- Dynamics: HHT-α (α = −0.1), β = (1−α)²/4, γ = ½−α, Newton on M/(βΔt²) + (1+α)K_T (banded LU),
  Δt = 0.005 T_osc, step halving where Newton fails or where a converged step turns a node by more
  than 0.3 rad (Newton otherwise finds roots 2π away in a nodal rotation). The rotations carry no
  mass and are not given a Newmark velocity. Mass: consistent for linearly interpolated centreline
  positions, (h/6)[[2,1],[1,2]] per translation, constant under rotation. At Ω = ωΔt = 2π/100
  (100 steps per period) HHT-α with α = −0.1 loses 1.6 × 10⁻⁷ of the amplitude per step, an
  equivalent damping ratio of 2.5 × 10⁻⁶ (the ratio grows as Ω³); its spectral radius at high
  frequency, 0.82, removes the axial ringing that makes the trapezoidal rule diverge here.
- Clamp motion: steps end exactly where the clamp's acceleration changes (end of the acceleration
  ramp, start and end of braking), so Newton never averages an acceleration across a jump; a
  transition closer than 10⁻³ Δt to a step's end moves that end onto it, since shorter substeps
  lose Newmark's acceleration (q₁ − q̃)/(βh²) to round-off. At each transition the free DOFs take
  the jump the consistent mass couples into them, M_ff Δa_f = −M_fc Δa_c; with a zero ramp the
  clamp's velocity jumps and the free DOFs take the impulse M_ff Δv_f = −M_fc Δv_c (on this mass
  the node next to the clamp moves back by 2 − √3 of the clamp's velocity, as the exact discrete
  impulse response). Every accepted substep, including those of a halved step, is a sample for
  the snap time, the jump's end and the largest angles; the trace drawn on the page bins whole
  steps of Δt, so it does not depend on how many substeps a platform needed.
- Protocol: start on the inverted branch at µ₀ = 0.6; the clamp(s) accelerate over 0.01 s (SM p. 7)
  to the release rate |µ̇| (decrease of µ per T_osc = 0.108 t*, SM p. 12; µ itself decreases, so
  the signed µ̇ is negative); both clamps with the lowest antisymmetric vibration mode as a seed of
  midpoint angle θ₀ = 10⁻³ rad (default), or one clamp without a seed (the paper's simulations).
  The moving clamp brakes over 0.01 s once the jump has ended, or from µ = 0.02 (the stopper) if it
  has not ended by then.
- Amplification: Eq. (2), t = 0 where µ = µ* (our µ* for the same α and mesh), the jump ending at
  the first maximum of the midpoint height after it crosses the clamps' line. A run ends `after`
  T_osc (1 by default) after that maximum has been observed, whatever the stopper did; braking
  never starts the end timer. A run whose midpoint never crosses reports no snap (`snapped: false`,
  every jump value null); a crossing whose first maximum is not observed, or a Newton failure
  before the jump has ended, is an error, never a truncated result.
  The crossing time is interpolated between the last nonpositive and first positive height and shortening is evaluated from the clamp law there. If either pre-jump angle maximum is exactly zero, its amplification ratio is undefined (`null`), including when the strip snapped. The final frame is the last accepted state.

## Results

### Steps 1–2, statics and stability

| | 24 el. | 48 el. | 96 el. | Richardson (order) | Reference | Difference |
|---|---|---|---|---|---|---|
| µ_A, α = 0.02, L/h = 2·10⁴ | 0.246896 | 0.249239 | 0.249836 | 0.250039 (1.97) | 1/4, Eq. (S17) | +0.016 % |
| µ*, α = 0.02 | 0.243988 | 0.246300 | 0.246891 | 0.247095 (1.97) | 0.247050, Eq. (S15); "≈ 0.247", p. 2 | +0.018 % |
| ω natural, µ = ¼, α = 0.02 | 58.273 | 57.961 | 57.883 | 57.857 (2.00) | √3348.04 = 57.862, p. 12 | −0.009 % |
| µ_A, α = π/12 | 0.246077 | 0.248415 | 0.249011 | 0.249216 (1.97) | (shallow: 0.25) | −0.31 % |
| µ*, α = π/12 | 0.243108 | 0.245412 | 0.246001 | 0.246203 (1.97) | (shallow: 0.247050) | −0.34 % |

The residual differences in the shallow limit (+1.6 × 10⁻⁴) are the strip's extensibility at
L/h = 2 × 10⁴ (axial strain over end-shortening ≈ τ²/(12(L/h)²µα²) = 1.7 × 10⁻⁴). At α = π/12 the
antisymmetric instability still precedes the fold (µ_A − µ* = 0.0030), so the structure of the
paper's Fig. 1c survives at the experimental angle. On the whole inverted branch the lowest
antisymmetric ω² stays below the symmetric one; the antisymmetric one crosses zero at µ_A, the
symmetric one at µ*. The two curves do not cross each other on that branch.

The analytic shallow values computed here: τ* = 8.98682 (paper 8.987), τ_fold = 9.20318 (9.203),
µ* = 0.2470500 (0.247), µ(τ*) = 1/4 exactly.

### Step 3, dynamics

| \|µ̇\| | A, two clamps, phase 0 | Two-clamp envelope | A, one clamp, zero seed | One-clamp envelope | µ at the two-clamp phase-zero snap |
|---|---|---|---|---|---|
| 0.005 | 96.1 | 104 | 156 | 118 | 0.2344 |
| 0.0075 | 89.4 | 89.4 | 98.8 | 95.5 | 0.2306 |
| 0.01 | 34.4 | 61.4 | 38.1 | 63.2 | 0.2273 |
| 0.015 | 34.2 | 41.4 | 40.1 | 44 | 0.2213 |
| 0.02 | 28.8 | 30.7 | 10.5 | 28.9 | 0.2166 |
| 0.03 | 6.51 | 15.4 | 4.12 | 17.4 | 0.2068 |
| 0.04 | 0.925 | 11.4 | 5.24 | 11.6 | 0.2007 |
| 0.05 | 6.08 | 7.81 | 7.52 | 8.5 | 0.1936 |
| 0.06 | 1.54 | 7.65 | 4.12 | 6.18 | 0.1897 |
| 0.08 | 4.57 | 5.46 | 2.18 | 3.56 | 0.1789 |
| 0.1 | 1.04 | 2.63 | 3.17 | 3.41 | 0.1649 |
| 0.12 | 1.5 | 2.92 | 2.35 | 2.51 | 0.1596 |
| 0.15 | 1.63 | 2.27 | 1.1 | 1.28 | 0.1545 |
| 0.2 | 0.895 | 1.16 | 0.85 | 0.917 | 0.1251 |
| 0.3 | 1.45 | 1.45 | 0.717 | 0.795 | 0.1192 |
| 0.5 | 0.536 | 1.19 | 0.928 | 0.972 | 0.0939 |
| 0.7 | 0.792 | 0.922 | 0.945 | 0.951 | 0.0568 |

Both envelopes take the maximum A over twelve phases of the same nonzero initial modal seed. The one-clamp runs start at ΔL/L = 0.2. In the separate zero-seed control, the moving clamp alone excites the asymmetric mode. Each envelope’s individual phase ratios are stored in phase order in `phase_amplifications`.

Replay (default): |µ̇| = 0.01 (4.31 mm/s for the paper's strip), seed 10⁻³ rad, A = 34.4, snap at
µ = 0.2273, 1.81 T_osc after µ*. Both clamps without a seed: largest |θ| was 7.065 × 10⁻¹⁰ rad at
|µ̇| = 0.01–0.3 (round-off, amplified at slow rates). Fig. 2a's rates on the one-clamp protocol:
1.8 mm/s (|µ̇| = 0.0042) gives A = 175, 246.6 mm/s (|µ̇| = 0.572) gives A = 1.07.

Times in `study.json` and on the page are in T_osc, which is 0.01718 s for the simulated strip
(`units.t_osc_simulations`; t* = 0.15908 s is `units.time_unit_simulations`). Each Fig. 2a run
stores the accepted shortening in both `trace.mu` and `paper_mu`. The end-node displacements
give the measured clamp travel `travel_mm`, relative to the fold. Both series follow acceleration,
constant-speed travel, braking and rest. During the hold the midpoint continues to oscillate.
The paper’s horizontal time axis is stored separately in `paper_axis_mm = 1000 × rate_m_s × time_s`.
Its linear shortening extrapolation is `nominal_mu = mu_star − rate × t`. At 246.6 mm/s the clamp moves 0.02118 mm per
0.005 T_osc = 8.59 × 10⁻⁵ s.

**Against Fig. 2c (simulations).** The largest A over phase falls below 2 at |µ̇| ≈
0.161 by log-rate interpolation. Using the first sampled rate below 2 for both curves gives 0.20 for the envelope and 0.1855 for the digitized paper simulations. The model brackets this crossing between 0.15 and 0.20, the paper between 0.1801 and 0.1855. Between |µ̇| = 0.04 and 0.1 the paper's 11 points span 11.5–35.6.
At the same rates the envelopes span 2.9–10.1 for two clamps and 3.4–10.5 for one clamp.
The paper/model ratios are 2.9–4.2 and 3.4–5.2, respectively.
Across the 49 sampled paper rates up to |µ̇| = 0.3 the median absolute relative differences
are 36 % for two clamps and 48 % for one clamp. The paper's
seed (the acceleration of its one moving end) is not given; at one phase A swings by an order of
magnitude between neighbouring rates (0.93 at |µ̇| = 0.04, 6.1 at 0.05), as the paper's Fig. S7
shows for the toy model, so only the envelope is a fair comparison. Row-by-row numbers are in
`VALIDATION.json` → `differences.figure_2c`.

**Sensitivity** (|µ̇| = 0.03 / 0.1; phase 0, then largest over phase):

| Setting | Values | A at phase 0 | Largest A over phase |
|---|---|---|---|
| Δt / T_osc | 0.02, 0.01, 0.005, 0.0025 | 6.69, 6.55, 6.51, 6.50 / 1.05–1.04 | 15.32–15.39 / 2.63–2.64 |
| HHT α | −0.05 … −0.3 | 6.51 ± 0.002 / 1.042 | 15.38 / 2.635 |
| Seed θ₀ | 10⁻⁴ … 3 × 10⁻³ (10⁻²) | 6.52–6.43 (5.69) / 1.04 | 15.48–14.68 (10.6) / 2.63 (2.58) |
| Elements | 24, 48, 96 | 2.67, 6.51, 8.41 / 1.00, 1.04, 1.06 | 15.60, 15.38, 14.98 / 2.76, 2.64, 2.65 |
| Start µ₀ | 0.4, 0.6, 1.0, 2.92 | 18.7, 6.5, 15.7, 7.4 / 4.6, 1.0, 1.4, 3.1 | 18.7, 15.4, 15.7, 17.7 / 4.6, 2.6, 3.5, 3.3 |

A at a single phase is sensitive to anything that shifts the phase of the antisymmetric oscillation
when the strip reaches the amplification region (mesh, start); the largest A over phase is stable to
3 % for refinement from 48 to 96 elements at the two tabulated rates. At rate 0.1 the larger change from 24 to 48 elements is visible in the table. Each truncated run and its sweep and phase appear in `dynamics.truncated_settings`. A marked envelope includes at least one run that stopped after its jump. A failure before the first height maximum aborts the study.


### Toy model

β = 0.110 and L₀C = 0.655 (p. 20) give µ*vM = 0.24628 (paper 0.247, −0.29 %, from the three-digit
rounding of β and L₀C), µ_A^vM = 0.24935 (0.25), angular frequencies at µ = ¼ of ω√(m/k)/α =
0.6629 and 0.7320 (paper "0.663" and "0.734", printed as ω_A/t_osc and ω_S/t_osc and labelled the
other way round, see the extraction) and t_osc = 9.479 √(m/k)/α (9.477). The time scale √(m/k)/α
is that of (S72); the paper's "ω/t_osc" is ω in its inverse, dimensionless, and t_osc = 2π/ω.
Equation (S52) includes ½ f ψ_A². From (S73) the effective masses in the symmetric and antisymmetric coordinates are 2 and ½. Applying the inverse masses to the energy gradient gives the coupling −½ b₃ ψ_S ψ_A² in (S74).
Integrating (S74)–(S75) and bisecting on whether the trajectory reaches f < 0 gives a critical rate
of 0.1052 against the paper's 0.0961 from its near-saddle-node reduction (+9.4 %). This paper comparison fails the 1% relative tolerance.

## What is reproduced and what is not

Reproduced, within the stated tolerances: the shallow theory's µ_A, µ*, τ*, τ_fold; our
finite-element µ_A, µ* and the natural frequency 57.86 in the shallow limit; the toy model's
constants, frequencies and t_osc; Fig. 2c’s first sampled envelope rate below A = 2 (within 20 %); the bifurcation order at α = π/12; the qualitative rate effect
(slow releases amplify a small asymmetry by tens, fast ones snap symmetrically, both ends without a
seed stay symmetric).

Not reproduced: the amplification factors of Fig. 2c in the comparison band; the toy model's critical
rate (about 10 % off); the experiments (no laboratory comparison is claimed); the paper's DER code,
which is not published, so its seed, time origin and snap window are our assumptions. Gravity,
damping, rotary inertia and the stopper's impact are not modelled.

## Evidence and what the badges count

`VALIDATION.json` has three parts. `checks` (23, all passing) are 10 checks of our own (mesh
orders, bifurcation order, symmetry without a seed, the rate effect, time step, the critical
heights against the branch's eigenvalue crossings, the Fig. 2a rate against its travel and time)
and 13 against
numbers in the paper (all 16 paper verdicts appear in `reference-results/published_comparison.json`), including the
rate at which Fig. 2c's amplification falls below 2 (0.20 against 0.1855, within 20 %, the spread of
the paper's own points around A = 2). `not_reproduced` lists the comparisons we fail, each with its
number and the tolerance it would need: Fig. 2c's amplitudes between |µ̇| = 0.04 and 0.1 (median
|A_ours/A_paper − 1| = 0.73 for the largest A over phase, 0.77 for the one-clamp envelope, against 0.25) and the
toy model's critical rate (|0.1052/0.0961 − 1| = 0.094 against 0.01). `differences` keeps the
row-by-row Fig. 2c numbers. The page's badge against the paper counts all of them: 13 of 16, marked
as failing. The catalogue records the partial reproduction in its relevance text. Its all-passed flag is false and its status is `interactive`.

The catalogue area is `metamaterials`, the area of the catalogue's two other snap-through papers
(Zmyślony, Khan & Biggins 2026; Fehér 2026), so the gallery's area filter groups them.

## Tolerances

- Published numbers printed to n digits: half the last digit (τ*, τ_fold, µ*: 5 × 10⁻⁴ absolute).
- FE in the shallow limit against 1/4, 0.247050 and 57.862: 3 × 10⁻⁴ relative, above the
  extensibility bias (1.7 × 10⁻⁴) plus the Richardson residual.
- Toy model against its printed values: 5 × 10⁻³ relative (β and L₀C are given to three digits;
  µ*vM moves by 0.3 % across that rounding), 10⁻³ absolute on the lower frequency.
- Mesh: observed order within 0.2 of 2. Time step: amplification changes by less than 2 % from
  Δt = 0.005 to 0.0025 T_osc.
- Both clamps without a seed: largest |θ| below 10⁻⁶ rad (a thousandth of the default seed); the
  observed maximum of 7.065 × 10⁻¹⁰ rad is round-off amplified near the fold and differs between platforms.
- Bifurcation order: µ*/µ_A ≤ 0.995 at α = π/12 (observed 0.9879).
- Critical heights: 10⁻⁴ αL between h_A, h* and the heights where the drawn branch's ω²_A and ω²_S
  cross zero, read by linear interpolation between branch points 0.002 αL apart (5 % of that
  step; observed 4.1 × 10⁻⁶). The old heights, in L, were off by the factor α = π/12 and fail it
  by 0.10.
- Fig. 2a speed uses a relative tolerance of 10⁻⁹. Over the same pre-fold window, the validator
  compares both the slope of measured end-node travel and the speed derived from prescribed
  shortening with the prescribed speed in m/s.
- Before reducing, `validate` checks that every run it reduces over is present (the 17 rates of
  both twelve-phase sweeps, their 17 one-clamp zero-seed controls, four unseeded two-clamp runs, the 40 twelve-phase sensitivity settings and both Fig. 2a runs, 911 runs in
  all), snapped, and finite; a missing run or a NaN fails instead of vanishing in a max or min.
- **WASM parity** (`check-wasm.mjs`, run by `build.sh`): the WASM build gives the same bits on
  every host, and differs from the native `replay.json` only through the last bits of libm,
  measured at 8 × 10⁻¹² before the snap and 2 × 10⁻¹⁰ after it (the asymmetry has grown 34 times
  by then). Before the snap: 10⁻⁹ on θ, h, t and µ, 1.5 × 10⁻⁷ on the node coordinates (stored
  rounded to 10⁻⁷). From the snap onward the band is 10⁻⁶ for angles, heights and node coordinates. Time and shortening retain the 10⁻⁹ band throughout frames and traces. Outcome: 10⁻⁸ absolute plus 10⁻⁶ relative; critical points 10⁻⁹.
  Both sides must be finite numbers (a `null` from a non-finite Rust value never passes), `snapped`
  must agree, and without a snap every jump value must be `null` on both sides.
- Evidence files are compared with a fresh run (`validate` without `--write`), which lists every
  number that moved. Numbers: 10⁻⁸ absolute plus 10⁻⁶ relative. They are converged equilibria,
  their eigenvalues and integrations on a fixed schedule, so between platforms they differ by
  round-off amplified through Newton and the integrator: raising the dynamics' Newton floor by 37 %
  moved every dynamic number by at most 10⁻⁷ relative, and on Linux CI the Fig. 2c transition moved
  by 7 × 10⁻⁹. The absolute floor covers numbers that are round-off themselves, such as the
  7.065 × 10⁻¹⁰ rad maximum asymmetry of the unseeded runs. Three kinds of number are worse conditioned and get
  bands from their conditioning instead:
  - A check's `observed` is a difference of close numbers; it may move by 10⁻³ of that check's
    tolerance, which cannot turn a verdict unless it sits within 0.1 % of the threshold.
  - Eigenvalues (ω² and the stiffnesses of the spectra): round-off moves an eigenvalue by an
    amount set by the matrix, not by the eigenvalue (Weyl's inequality), so near the fold, where
    ω²_S passes through zero, its relative error is large (on Linux CI ω²_S = 0.0715 moved by
    8 × 10⁻⁷). Each is compared to 10⁻⁸ plus 10⁻⁶ of the larger of its symmetric/antisymmetric
    pair (195 there).
  - Richardson order and correction divide by differences of nearly equal mesh results (for ω,
    d₂ = 0.075 against values of 57; on Linux CI the order moved by 3 × 10⁻⁶ and the correction by
    1.4 × 10⁻⁷). Their band is twice the first-order propagation of the three mesh values' actual
    drift through d₁ and d₂, plus 10⁻¹² relative; the mesh values themselves are compared under
    the usual band, so a stale order with unchanged inputs still fails.

  - The truncated-run count, identities and affected summaries must match exactly. A platform-dependent Newton failure changes the evidence and requires review. Spectral values within the paired numerical band of zero are marked in `unresolved_signs`. A change of sign is always reported.

  The verdicts themselves, the counts of points and runs, and every other non-number must match
  exactly.

## Reproduce

```sh
make test.research.vella        # cargo test, then validate against the stored evidence
make evidence.research.vella    # replay.json, study.json, VALIDATION.json, published_comparison.json, MANIFEST
research/mechanics/vella-2024/build.sh   # the page's WASM bundle; checks it against replay.json
node research/mechanics/vella-2024/thumbnail.mjs   # the gallery thumbnail from replay.json
python3 -I research/mechanics/vella-2024/reference/digitize_fig2c.py <arXiv v2 PDF> out.csv   # needs PyMuPDF
```

`validate` takes several minutes: it reruns every mesh study, the rate sweeps over twelve phases and
the sensitivity studies.

## Open questions for the authors

1. **Rate units.** Is |µ̇| = |ΔL̇|·T_osc·t*/(α²L), with T_osc = 0.108 and t* from the experimental
   strip? The crosses of Fig. 2c sit at 2.34–2.42 s/m × |ΔL̇| (Table S1 rounding), which that gives
   (2.358 s/m); the figure's top axis implies 2.50 s/m.
2. **Time origin.** The main text puts t = 0 at µ = µ* (and writes µ = µ* − |µ̇|t); SM p. 22 says
   the main text uses µ = µ_A − |µ̇|τ. Which was used for Fig. 2c and Fig. 4? For the DER runs at
   α = π/12, was µ* the shallow 0.247 or the fold of the finite-angle strip (0.2462 in our model)?
3. **The seed of the DER simulations in Fig. 2c.** Which end-motion profile (acceleration, ramp
   time) did they use, did they start at ΔL/L = 0.2 for every rate, and where did the window for
   max_{t>0}|θ| end?
4. **External forces in (S32).** Were gravity or damping included in the DER runs?
5. **Toy frequencies.** Linearising (S73)–(S75) we get the lower frequency (0.663) for the symmetric
   mode and 0.732 for the antisymmetric one, the reverse of the labels on p. 22; t_osc uses the lower
   one, while T_osc of the arch uses its antisymmetric mode. Is that the intended matching?
6. **Critical rate.** Is 0.0961 from (S89)–(S92) alone? Integrating (S74)–(S75) directly we find
   0.105.
7. **Fig. S1c** is labelled h/L; its values are h/(αL). **(S86)** has the opposite sign of the
   ((2+L₀C)µ − 2β)ψ_S term to (S74).
