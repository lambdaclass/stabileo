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
fits inside the crate (about 300 lines of `src/dynamics.rs`) and works on the production element; it
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
  L/h = 108/0.0508 (the paper's simulated strip, SM p. 12). 48 elements by default.
- Clamps: both ends fixed in z, rotated to ±α (anticlockwise tangent +α on the left), moved in x.
  µ = ΔL/(α²L) (Eq. 1).
- Natural state: turn the clamps with the right end sliding, then move both ends to ±ΔL/2
  (production `solve_corotational_2d_from`).
- Inverted state: a downward midpoint load traced by production arc-length from the natural state
  through its limit point, until the load returns to zero on the inverted side; the arc-length
  constraint mixes displacements with loads, so EI is scaled by 0.005 on that path (shapes do not
  depend on it).
- Inverted branch: production arc-length on the end-shortening.
- µ_A: bisection on the midpoint height for the sign change of the antisymmetric tangent
  (Sylvester's inertia of an LDLᵀ); µ*: golden-section search for the least shortening along the
  branch parametrised by the midpoint height.
- Spectra: the tangent projected on the mirror-symmetric and antisymmetric free DOFs; ω² from
  K φ = ω² M φ with the rotations condensed (no rotary inertia, as the paper's beam equation S2).
- Dynamics: HHT-α (α = −0.1), β = (1−α)²/4, γ = ½−α, Newton on M/(βΔt²) + (1+α)K_T (banded LU),
  Δt = 0.005 T_osc, step halving where Newton fails or where a converged step turns a node by more
  than 0.3 rad (Newton otherwise finds roots 2π away in a nodal rotation). The rotations carry no
  mass and are not given a Newmark velocity. Mass: consistent for linearly interpolated centreline
  positions, (h/6)[[2,1],[1,2]] per translation, constant under rotation. HHT's damping ratio for
  the slow modes is O(Ω³) (of order 10⁻⁷ at 100 steps per period); its spectral radius at high
  frequency, 0.82, removes the axial ringing that makes the trapezoidal rule diverge here.
- Protocol: start on the inverted branch at µ₀ = 0.6; the clamp(s) accelerate over 0.01 s (SM p. 7)
  to the rate µ̇ (change of µ per T_osc = 0.108 t*, SM p. 12); both clamps with the lowest
  antisymmetric vibration mode as a seed of midpoint angle θ₀ = 10⁻³ rad (default), or one clamp
  without a seed (the paper's simulations). After the jump the moving clamp brakes over 0.01 s.
- Amplification: Eq. (2), t = 0 where µ = µ* (our µ* for the same α and mesh), the jump ending at
  the first maximum of the midpoint height after it crosses the clamps' line.

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

| µ̇ | A, seeded, phase 0 | A, largest over 12 phases | A, one clamp from ΔL/L = 0.2 | µ at the snap |
|---|---|---|---|---|
| 0.005 | 96.1 | 104 | 156 | 0.2344 |
| 0.0075 | 89.4 | 89.4 | 98.8 | 0.2306 |
| 0.01 | 34.4 | 61.4 | 38.1 | 0.2273 |
| 0.015 | 34.2 | 41.4 | 40.1 | 0.2213 |
| 0.02 | 28.8 | 30.7 | 10.5 | 0.2165 |
| 0.03 | 6.51 | 15.4 | 4.12 | 0.2067 |
| 0.04 | 0.925 | 11.4 | 5.24 | 0.2006 |
| 0.05 | 6.08 | 7.81 | 7.52 | 0.1936 |
| 0.06 | 1.54 | 7.65 | 4.12 | 0.1897 |
| 0.08 | 4.57 | 5.46 | 2.18 | 0.1789 |
| 0.1 | 1.04 | 2.63 | 3.17 | 0.1646 |
| 0.12 | 1.5 | 2.92 | 2.35 | 0.1591 |
| 0.15 | 1.63 | 2.27 | 1.1 | 0.1539 |
| 0.2 | 0.895 | 1.16 | 0.85 | 0.1242 |
| 0.3 | 1.45 | 1.45 | 0.717 | 0.1188 |
| 0.5 | 0.536 | 1.19 | 0.928 | 0.0930 |
| 0.7 | 0.792 | 0.922 | 0.945 | 0.0547 |

Replay (default): µ̇ = 0.01 (4.31 mm/s for the paper's strip), seed 10⁻³ rad, A = 34.4, snap at
µ = 0.2273, 1.82 T_osc after µ*. Both clamps without a seed: largest |θ| ≤ 2.4 × 10⁻¹⁰ rad at
µ̇ = 0.01–0.3 (round-off, amplified at slow rates). Fig. 2a's rates on the one-clamp protocol:
1.8 mm/s (µ̇ = 0.0042) gives A = 175, 246.6 mm/s (µ̇ = 0.572) gives A = 1.07.

**Against Fig. 2c (simulations).** The largest A over phase falls below 2 at µ̇ ≈
0.161, the one-clamp curve at 0.15; the paper's points first fall below 2 at
µ̇ ≈ 0.185 (−13 % and −19 %). Between µ̇ = 0.04 and 0.1 the paper's
points are 10–41 and ours 3–12 (largest over phase) or 2–7 (one clamp): the median relative difference
over the paper's points up to µ̇ = 0.3 is 36 % (largest over
phase) and 56 % (one clamp), all of the same sign. The paper's
seed (the acceleration of its one moving end) is not given; at one phase A swings by an order of
magnitude between neighbouring rates (0.93 at µ̇ = 0.04, 6.1 at 0.05), as the paper's Fig. S7
shows for the toy model, so only the envelope is a fair comparison. Row-by-row numbers are in
`VALIDATION.json` → `differences.figure_2c`.

**Sensitivity** (µ̇ = 0.03 / 0.1; phase 0, then largest over phase):

| Setting | Values | A at phase 0 | Largest A over phase |
|---|---|---|---|
| Δt / T_osc | 0.02, 0.01, 0.005, 0.0025 | 6.69, 6.55, 6.51, 6.50 / 1.05–1.04 | 15.32–15.39 / 2.63–2.64 |
| HHT α | −0.05 … −0.3 | 6.51 ± 0.002 / 1.042 | 15.38 / 2.635 |
| Seed θ₀ | 10⁻⁴ … 3 × 10⁻³ (10⁻²) | 6.52–6.43 (5.69) / 1.04 | 15.48–14.68 (10.6) / 2.63 (2.58) |
| Elements | 24, 48, 96 | 2.67, 6.51, 8.41 / 1.00, 1.04, 1.06 | 15.60, 15.38, 14.98 / 2.76, 2.64, 2.65 |
| Start µ₀ | 0.4, 0.6, 1.0, 2.92 | 18.7, 6.5, 15.7, 7.4 / 4.6, 1.0, 1.4, 3.1 | 18.7, 15.4, 15.7, 17.7 / 4.6, 2.6, 3.5, 3.3 |

A at a single phase is sensitive to anything that shifts the phase of the antisymmetric oscillation
when the strip reaches the amplification region (mesh, start); the largest A over phase is stable to
3 % in mesh and Δt. Two of the 707 dynamic runs of the study stopped early after their jump,
where Newton failed on 2⁸ substeps of the post-snap ringing; the amplification had been measured.


### Toy model

β = 0.110 and L₀C = 0.655 (p. 20) give µ*vM = 0.24628 (paper 0.247, −0.29 %, from the three-digit
rounding of β and L₀C), µ_A^vM = 0.24935 (0.25), frequencies at µ = ¼ of 0.6629 and 0.7320 (paper
"0.663" and "0.734", labelled the other way round, see the extraction) and t_osc = 9.479 (9.477).
Integrating (S84)–(S85) and bisecting on whether the trajectory reaches f < 0 gives a critical rate
of 0.1052 against the paper's 0.0961 from its near-saddle-node reduction (+9.4 %); this is reported,
not checked.

## What is reproduced and what is not

Reproduced, within the stated tolerances: the shallow theory's µ_A, µ*, τ*, τ_fold; our
finite-element µ_A, µ* and the natural frequency 57.86 in the shallow limit; the toy model's
constants, frequencies and t_osc; the bifurcation order at α = π/12; the qualitative rate effect
(slow releases amplify a small asymmetry by tens, fast ones snap symmetrically, both ends without a
seed stay symmetric).

Not reproduced: the amplitudes and transition rate of Fig. 2c (trend only); the toy model's critical
rate (about 10 % off); the experiments (no laboratory comparison is claimed); the paper's DER code,
which is not published, so its seed, time origin and snap window are our assumptions. Gravity,
damping, rotary inertia and the stopper's impact are not modelled.

## Tolerances

- Published numbers printed to n digits: half the last digit (τ*, τ_fold, µ*: 5 × 10⁻⁴ absolute).
- FE in the shallow limit against 1/4, 0.247050 and 57.862: 3 × 10⁻⁴ relative, above the
  extensibility bias (1.7 × 10⁻⁴) plus the Richardson residual.
- Toy model against its printed values: 5 × 10⁻³ relative (β and L₀C are given to three digits;
  µ*vM moves by 0.3 % across that rounding), 10⁻³ absolute on the lower frequency.
- Mesh: observed order within 0.2 of 2. Time step: amplification changes by less than 2 % from
  Δt = 0.005 to 0.0025 T_osc.
- Both clamps without a seed: largest |θ| below 10⁻⁶ rad (a thousandth of the default seed); the
  observed 2.4 × 10⁻¹⁰ is round-off amplified near the fold and differs between platforms.
- Bifurcation order: µ*/µ_A ≤ 0.995 at α = π/12 (observed 0.9879).
- Evidence files are compared with a fresh run to 10⁻⁸ absolute plus 10⁻⁶ relative (`validate`
  without `--write`).

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

1. **Rate units.** Is µ̇ = |ΔL̇|·T_osc·t*/(α²L), with T_osc = 0.108 and t* from the experimental
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
6. **Critical rate.** Is 0.0961 from (S89)–(S92) alone? Integrating (S84)–(S85) directly we find
   0.105.
7. **Fig. S1c** is labelled h/L; its values are h/(αL). **(S86)** has the opposite sign of the
   ((2+L₀C)µ − 2β)ψ_S term to (S74).
