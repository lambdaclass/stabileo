# Paper extraction: Wang, Giudici, Huang, Wang, Liu, Tawfick & Vella (2024)

Q. Wang, A. Giudici, W. Huang, Y. Wang, M. Liu, S. Tawfick, D. Vella, *Transient amplification of
broken symmetry in elastic snap-through*, Phys. Rev. Lett. **132**, 267201 (2024),
doi:10.1103/PhysRevLett.132.267201.

## What was read

| Document | Where from | SHA-256 | Pages |
|---|---|---|---|
| arXiv:2312.13908**v2** (2 July 2024), main text + Supplemental Information in one PDF | `https://arxiv.org/pdf/2312.13908v2` | `33d95f01b305100739562691008f63d97ee2d4262eb573ecc022060f47fa0329` | 25 (main pp. 1–6, SM pp. 7–25) |
| arXiv:2312.13908v1 (21 Dec 2023), kept to check what changed | `https://arxiv.org/pdf/2312.13908v1` | `248605688f1fcafcda7a841e09476572d2d55ca7e781c2417abbe862fa247a8c` | — |

v1 lacks Table S1, the natural frequency ω ≈ 57.86 and T_osc, and the toy model's \|µ̇_c\|; every
number below is from v2. Every page number below is the **PDF page of arXiv v2** (the SM's own numbering restarts at 1 on
PDF p. 7; it is given in brackets where it helps). The APS version of record was not opened; v2
is dated after acceptance and its text matches the published abstract. Neither PDF is stored in
the repository. Figures were read from the PDF only to transcribe numbers; none is reproduced.

## Strip, material, clamps

| Quantity | Value | Source | Used here |
|---|---|---|---|
| Length L | 108 mm | p. 1 (main text); p. 7 [SM p. 1, §I.A]; p. 12 [SM p. 6, §III] | L = 1 (units of L) |
| Thickness | 0.05 mm (experiments, called *b* in the main text) | p. 1; p. 7 | rate conversion (below) |
| Thickness | 0.0508 mm (simulations, called *h*) | p. 12 [SM §III] | L/h = 108/0.0508 = 2125.98 |
| Width w | 25 mm (experiments); 25.0 mm (simulations) | p. 1; p. 7; p. 12 | drops out (I = wh³/12, ρA = ρwh) |
| Young's modulus E | ≈ 200 GPa; 200 GPa in simulations | p. 1; p. 7; p. 12 | drops out of the dimensionless problem |
| Density ρ | 8000 kg/m³ (simulations) | p. 12 | t* (below) |
| Poisson ratio ν | "does not enter our calculations" (narrow strip, I = h³w/12) | p. 12 | not used |
| Clamp angle α | π/12 rad, symmetric, to the horizontal | p. 1; p. 7; p. 12 | default; slider 0.10–0.40 rad |
| Boundary conditions | ζ(±½) = 0, ζ_x(±½) = ∓α (dimensionless) | Eq. (S8), p. 10 | clamped ends at ±α |
| Initial end-shortening (simulations) | ΔL/L = 0.2 | p. 12 | sensitivity study; page starts at µ₀ = 0.6 (SUPUESTO 6) |
| Material | Wear-resistant 1095 spring steel (McMaster-Carr) | p. 1; p. 7 | — |
| Damping | "ignore any damping" (theory) | p. 9 [SM §II.A] | none |

**Dimensionless groups** (SM §II.A, p. 10, Eq. S5): ζ = ζ̄/L, x = x̄/L, τ² = TL²/B, t = t̄/t*,
t* = L²√(ρbh/B), B = Ebh³/12 (here b is the width). With the simulation values,
t* = 0.1591 s; with the experimental thickness, t* = 0.1616 s.

## Loading protocol and how snap-through is triggered

| Item | Value | Source |
|---|---|---|
| Trigger | the end-shortening ΔL is *decreased* (ends moved apart) until the inverted state no longer exists | p. 1; p. 7 |
| Experiments | right clamp fixed, left clamp on a motorised linear stage; a stopper "just beyond the position at which snap-through is expected" | p. 2 (Fig. 1a); p. 7 |
| Speed range (experiments) | 1 mm/s ≤ \|ΔL̇\| ≤ 30 cm/s | p. 1 |
| Motor | driving frequency 10 Hz – 10⁵ Hz; acceleration time fixed at 0.01 s | p. 7 |
| Fig. 2a rates | slow \|ΔL̇\| = 1.8 mm/s; fast 246.6 mm/s | p. 3 (caption) |
| Simulations | one end moved; both ends moved with the same acceleration gives no oscillation and a symmetric snap | p. 2; p. 14 [SM §III.A] |
| Asymmetry source (simulations) | the acceleration of the one moving end; "different accelerations" control its size; values not given | p. 14 |
| High-speed camera | 2245 fps; 1184 × 424 px | p. 1; p. 7 |
| Experiments | 30 tests, Table S1 | p. 8 |

## Numerical method of the paper

Planar discrete elastic rods (DER), stretching (S27) and bending (S29) energies, N nodes, first
and last two nodes constrained, symplectic Newmark-β (S32) with a **diagonal** mass matrix and
Newton–Raphson; converged at **N = 100 nodes, δt = 0.01 ms** (Fig. S4). pp. 12–14.

## Published numbers we can check

| Number | Value | Source |
|---|---|---|
| Fold (saddle-node) of the inverted branch, shallow theory | µ* ≈ 0.247 at τ ≈ 9.203 | p. 2 (after Eq. 1); p. 11 |
| Asymmetric bifurcation, shallow theory | µ_A = 1/4 | p. 2; Eq. (S17), p. 11 |
| Force of the asymmetric solutions | τ* ≈ 8.987 (τ*/2 = tan τ*/2) | p. 11 |
| Natural state, µ = 0.25 (τ = π): lowest (antisymmetric) frequency | ω = √(−λ²) ≈ √3348.04 ≈ 57.86; T_osc = 2π/ω = 0.108 | p. 12 [SM §II.D] |
| Shallow branch height | h = ζ(0) from Eq. (S14) | p. 10 |
| Toy model parameters | β = 0.110, L₀C = 0.655 (chosen so that µ*vM = 0.247, µ_A^vM = 1/4) | p. 20 |
| Toy model frequencies at µ = 1/4 | "ω_A/t_osc = 0.663", "ω_S/t_osc = 0.734", t_osc = 2π/ω_s = 9.477 (time in √(m/k)/α, (S72): the printed ratios are ω√(m/k)/α, dimensionless, and t_osc is in √(m/k)/α) | p. 22, Eq. (S80) |
| Toy model critical rate | \|µ̇_c\| ≈ 0.0961 (0.096 on p. 25) | p. 4 (Fig. 4 caption); p. 25 |
| Experimental amplifications | Table S1: 30 pairs (\|ΔL̇\|, A) | p. 8 |
| Amplification | A := max_{t>0}\|θ\| / max_{t<0}\|θ\|, t = 0 where µ(0) = µ* | Eq. (2), p. 2 |
| Amplification (experiments) | Eq. (S1), with √2·std of θ before the snap | p. 8 |

## Figures and curves, and whether they can be reproduced

| Figure | Content | Variables | Reproduced here |
|---|---|---|---|
| 1c | bifurcation diagram (schematic) | µ, height | yes, from our static paths (finite α) |
| S1c | h vs µ near µ_A, µ*: natural, inverted, grey and asymmetric branches | µ ∈ [0.24, 0.26]; axis labelled h/L | yes: shallow analytic (S14–S17) and our FE at small α. The axis values (natural 0.32, cyan −0.137) are h/(αL), not h/L |
| S3 | antisymmetric vibration mode of the natural state at µ = 0.25 | x, ζ | yes (our eigenvector) |
| 2a | θ(t) for 1.8 and 246.6 mm/s, experiment and simulation | −tΔL̇ (mm), θ (rad) | yes, qualitatively, from our runs at the same \|µ̇\| |
| 2b | \|θ\| for three accelerations, one end moved; both ends → θ ≡ 0; inset \|θ/θ_b\| collapses | −tΔL̇ (mm) | the both-ends symmetry and the collapse, qualitatively |
| 2c | A vs \|ΔL̇\| (top axis) and \|µ̇\| (bottom); experiments, simulations, model band | \|µ̇\|, A | yes: experiments from Table S1 (exact), simulation points read off the figure (by eye / pixel positions) |
| 3, 4a, S5–S7 | double-mass von Mises toy model | ψ_S, ψ_A, µ, τ | the toy model's constants and \|µ̇_c\| are checked; its trajectories are not drawn |
| 4b | A′ = max\|ψ_A\|/\|ψ_A⁰\| vs \|µ̇\| for the toy model | \|µ̇\|, A′ | \|µ̇_c\| checked; the curve is not drawn |
| S2 | experimental θ(t), h(t) for 12 speeds | — | no (experimental traces) |
| S4 | convergence of θ in δt and N for the DER | — | our own δt and mesh study instead |

## Rate units (inferred, not stated)

The paper never writes \|µ̇\| in terms of ΔL̇. Fig. 2c plots each Table S1 experiment at
\|µ̇\| ≈ 2.34–2.42 s/m × \|ΔL̇\| (pixel positions of 15 isolated crosses on the figure's embedded
raster; the spread is Table S1's two-digit rounding). That matches
\|µ̇\| = \|ΔL̇\| · T_osc · t* / (α²L) = 2.358 s/m × \|ΔL̇\| with T_osc = 0.108 and t* from the
experimental thickness 0.05 mm. The figure's **top axis** ticks (0.08 m/s on \|µ̇\| = 0.2) imply
2.50 s/m instead, 6 % off its own data points. We use the T_osc-based definition: one unit of
\|µ̇\| is a decrease of µ by one per period T_osc (µ decreases while the ends separate, so the signed µ̇ is negative). With the simulation thickness (0.0508 mm) the
factor is 2.321 s/m; the page reports both \|µ̇\| and the corresponding \|ΔL̇\| for the paper's strip.

## Things that do not agree inside the paper

1. **t = 0.** Main text (p. 2 and p. 4): t = 0 where µ(0) = µ*, and µ = µ* − \|µ̇\|t. SM p. 22:
   "in the main text, we substitute µ = µ_A − \|µ̇\|τ so that the quasi-static instability occurs
   at τ = 0". We use µ* and report the µ_A variant too.
2. **Toy frequencies.** Linearising (S74)–(S75) with the kinetic energy (S73) gives
   (ω_S/t_osc)² = ½(a₂ − a₃µ + 3a₄ψ_N²) and (ω_A/t_osc)² = 2(b₁ − b₂µ + b₃ψ_N²). At µ = 1/4 their square roots are
   0.663 (symmetric) and 0.732 (antisymmetric): the labels in the text (p. 22) are swapped, and
   (S78)–(S79) as printed lack the factors ½ and 2 and carry a 3 in (S79). t_osc = 2π/0.663 = 9.477
   agrees with the text.
3. **(S86)** prints 3ψ̈_S = β − ((2+L₀C)µ − 2β)ψ_S − ψ_S³; (S74) with (S54) gives
   +((2+L₀C)µ − 2β)ψ_S, and only that sign reproduces µ*vM ≈ 0.247 and the bistability.
4. **Fig. S1c** is labelled h/L; its values are those of h/(αL) from (S14).
5. **Fig. 2c** top axis versus its plotted experiments (above).
6. **Thickness**: 0.05 mm (experiments) and 0.0508 mm (simulations); width called *w* in the
   main text and *b* in SM §II.

## SUPUESTOS (not in the paper or the SM)

1. **ρ for the experiments**: 8000 kg/m³, the simulation value (p. 12). Only used to convert
   rates and times to SI for display.
2. **Model thickness** L/h = 108/0.0508 = 2125.98 (simulation thickness 0.0508 mm), since we compare with the
   simulations. It sets only the axial stiffness, EA·L²/EI = 12(L/h)² = 5.42 × 10⁷.
3. **Rate definition** (above).
4. **Origin of time.** t = 0 where µ equals *our* fold µ* for the same α and mesh, not 0.247:
   the shallow value differs from the finite-angle fold at α = π/12 by 0.3–0.7 %.
5. **End of the jump** for Eq. (2): the first maximum of the midpoint height after it crosses
   zero. The paper's simulation window after t = 0 is not stated; the experiments stop at a
   local extremum of h after the snap (p. 8), which is the same idea.
6. **Start**: the page and the rate sweeps start on the inverted branch at µ₀ = 0.6, not at
   ΔL/L = 0.2 (µ₀ = 2.92 at α = π/12), to keep live runs short. The sensitivity to µ₀ is reported.
7. **Asymmetric seed.** (a) Both ends move and the start state carries the lowest antisymmetric
   vibration mode with midpoint angle θ₀ = 10⁻³ rad (default; Fig. 2b's θ_b is of this order by
   eye), and (b) the paper's one-end protocol with the experiments' acceleration time 0.01 s
   (p. 7) and no seed. The acceleration used in the paper's simulations is not given.
8. **Stopper.** After the jump ends (or at µ = 0.02 if it has not), the moving clamp brakes
   uniformly over the acceleration time. Its position is not given (p. 7).
9. **No gravity, no damping, no rotary inertia.** The theory has none (Eq. S2); the DER mentions
   gravity and damping as possible external forces (p. 13) without values.
10. **Mass matrix**: consistent for linearly interpolated centreline positions (the DER uses a
    diagonal one).
11. **Numerical dissipation**: HHT-α with α = −0.1 (ours).
