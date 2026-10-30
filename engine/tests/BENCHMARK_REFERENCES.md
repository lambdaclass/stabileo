# Benchmark References for Proper Test Reproductions

## Curved Beams

### VM18 — Out-of-Plane Bending of a Curved Bar
- **Source**: ANSYS Verification Manual, VM18
- **URL**: https://examples.mapdl.docs.pyansys.com/verif-manual/vm-018.html
- **Problem**: Quarter-circle cantilever bar with out-of-plane load at free end
- **Parameters**: R = 100 in, cross-section 2×2 in (square), E = 30×10⁶ psi, ν = 0.0, F = 50 lb (out-of-plane)
- **Reference Answer**: δ_B = -2.648 in (displacement at free end in load direction)
- **Analytical Source**: Timoshenko, *Strength of Materials*, Part II, 3rd Ed., p. 412, eq. (c)
- **Formula**: δ = F·R³/(4EI) · (π + 2π·EI/(GJ))  where GJ = GJ_torsion
- **Note**: This is a 3D problem with out-of-plane loading. Our solver handles this via curved beam segment subdivision + 3D frame elements.

### Roark Ring Formula — Circular Ring Under Diametrically Opposite Loads
- **Source**: Roark, *Formulas for Stress and Strain*, 8th Ed., Table 9.2, Case 1
- **Problem**: Complete circular ring loaded by two equal and opposite forces P along a diameter
- **Formula**: δ_vertical = P·R³/(EI) · (π/4 - 2/π) ≈ 0.1488 · P·R³/(EI)
- **Note**: Ring must be modeled as full circle (not half/quarter). Two curved beams or one 360° arc.

### Semicircular Arch Under Crown Load (Pinned-Pinned)
- **Source**: Timoshenko & Goodier, *Theory of Elasticity*; Roark Table 9.2
- **Problem**: Semicircular arch, pinned at both ends, vertical point load at crown
- **Horizontal thrust**: H = P/π
- **Crown vertical deflection**: δ_v = P·R³/(EI) · (π/4 - 2/π) (for pin-pin semicircular arch)

---

## Plates / Shells

### Navier Solution — Simply Supported Square Plate Under Uniform Pressure
- **Source**: Timoshenko & Woinowsky-Krieger, *Theory of Plates and Shells*, 2nd Ed., Table 8
- **Also**: Cook et al., *Concepts and Applications of FEA*, 4th Ed.
- **Problem**: Square plate, side a, thickness t, all edges simply supported, uniform pressure p
- **Formula**: w_max = α · p · a⁴ / D, where D = E·t³/(12(1-ν²))
- **Key Coefficient**: α = 0.00406 (for ν = 0.3, square plate, Table 8)
- **Also known as**: α = 0.00416 for ν = 0.0 (important to match ν!)
- **Convergence**: Need 8×8 mesh or finer for <5% error with DKT elements
- **Reference Answer Example**: a=1m, t=0.01m, E=200GPa, ν=0.3, p=1kPa → D=18315.02, w=0.00406·1·1/(18315.02)=2.216×10⁻⁷ m

### Scordelis-Lo Roof (NAFEMS)
- **Source**: NAFEMS standard test, MacNeal & Harder (1985)
- **Problem**: Cylindrical roof shell, gravity loading
- **Reference**: u_z = 0.3024 at midspan free edge
- **Status**: MITC4 ANS shear tying: 6×6 mesh: 80%. MITC9: 2×2 mesh: 96%, 6×6 mesh: 85%.

### Hemisphere with 18° Hole (NAFEMS LE3)
- **Source**: NAFEMS, "The Standard NAFEMS Benchmarks" (TNSB), Rev 3, 1990, Test LE3
- **Problem**: Hemisphere R=10, t=0.04, 18° hole at apex. Quarter model with symmetry. Diametral point loads F=2 at equator.
- **Material**: E=68.25, ν=0.3 (same as MacNeal-Harder hemisphere)
- **Reference Answer**: u_x = 0.185 at equator point A (x-axis)
- **Value**: Same physics as pinched hemisphere (R/t=250) but avoids pole singularity, improving mesh quality.
- **Status**: Self-convergence test at 4×4, 8×8, 16×16. Membrane locking expected at this R/t.

### Partly Clamped Hyperbolic Paraboloid (Chapelle-Bathe)
- **Source**: Chapelle & Bathe, "The Finite Element Analysis of Shells", 2003; also Bathe & Iosilevich (2000)
- **Problem**: z = x² − y², domain [−0.5, 0.5]², t=0.01, one edge clamped (x=−0.5), uniform vertical pressure f=8t
- **Material**: E=2.0×10¹¹ Pa (200 GPa), ν=0.3
- **Reference**: No closed-form. Self-convergence study (32×32 as reference).
- **Value**: Bending-dominated, negative Gaussian curvature. Strong membrane locking discriminator.
- **Status**: Self-convergence test at 4×4, 8×8, 16×16, 32×32.

### Shallow Spherical Cap Under Uniform Pressure
- **Source**: Timoshenko & Woinowsky-Krieger, "Theory of Plates and Shells", Ch. 16
- **Problem**: Spherical cap R=100, t=1 (R/t=100), half-angle α=10°, clamped base, uniform external pressure p=1.0
- **Material**: E=200 GPa, ν=0.3
- **Reference**: Plate approximation w ≈ p·a⁴/(64·D). Self-convergence study (32×32 as reference).
- **Value**: Moderate R/t=100, axisymmetric loading. Tests the "comfortable" zone for MITC4+EAS-7.
- **Status**: Self-convergence test at 4×4, 8×8, 16×16, 32×32.

### Pinched Hemisphere R/t Parameter Sweep
- **Source**: MacNeal & Harder (1985), varying thickness to map R/t boundary
- **Problem**: Same pinched hemisphere as standard test, R=10 fixed, t varied for R/t = 10, 25, 50, 100, 250, 500
- **Reference**: Analytical scaling u ∝ (R/t)² from known u=0.0924 at R/t=250
- **Value**: Maps exact MITC4+EAS-7 capability boundary. Key deliverable for element selection.
- **Status**: Sweep at 16×16 mesh.

---

## Nonlinear Material / Plastic Collapse

### Plastic Collapse Load Factors (Textbook)
- **Source**: Neal, *Plastic Methods of Structural Analysis*; Chen & Sohal, *Plastic Design and Second-Order Analysis*
- **Fixed-Fixed Beam, Central Point Load**: Pc = 8·Mp/L (first hinge at midspan, then ends)
- **Fixed-Fixed Beam, UDL**: wc = 16·Mp/L² (hinges at ends then midspan)
- **Propped Cantilever, Central Point Load**: Pc = 6·Mp/L
- **Simply Supported Beam**: Pc = 4·Mp/L (single hinge at midspan)

### VM15-style — Fixed-Fixed Beam Plastic Collapse
- **Note**: ANSYS VM15 is actually a different problem (circular plate). We use the textbook plastic collapse benchmark instead.
- **Problem**: Fixed-fixed beam, length L, central point load P
- **Parameters**: L=4m, E=200GPa, b=0.15m, h=0.30m → A=0.045m², Iz=3.375×10⁻⁴ m⁴, Zp=b·h²/4=3.375×10⁻³ m³, Fy=250MPa → Mp=Fy·Zp=843.75 kN·m
- **Collapse Load**: Pc = 8·Mp/L = 8×843.75/4 = 1687.5 kN
- **Tolerance**: <5% on collapse load factor

---

## Co-rotational / Large Displacement

### ANSYS VM14 — Eccentric Compression of a Column (Large Deflection)
- **Source**: ANSYS Verification Manual, VM14
- **URL**: https://examples.mapdl.docs.pyansys.com/verif-manual/vm-014.html
- **Problem**: Simply supported column, eccentric axial load P, length L
- **Parameters**: L=120 in, rectangular 3×5 in cross section, E=30×10⁶ psi, P=4000 lb, eccentricity e=0.3 in
- **Reference Answer**: δ_mid = 0.1086 in (midspan lateral deflection, secant formula)
- **Analytical**: δ = e · [sec(L/2 · √(P/EI)) - 1]
- **Note**: This is a moderate-displacement problem suitable for co-rotational solver

### Mattiasson Elastica — Cantilever Large Deflection

**Issue #845 resolution:** benchmark reference/model/stepping defects; no engine
implementation change. The old provisional numbers were not valid inextensible
references. The original finite-area model also has appreciable axial extension,
and ten equal increments exhausted the Newton budget at load 10. All four cases
are now active, with independent references and tighter accuracy checks.

**Sources and provenance.** Mattiasson (1981), *Numerical results from large
deflection beam and frame problems analysed by means of elliptic integrals*,
IJNME 17, 145–153, [DOI 10.1002/nme.1620170113](https://doi.org/10.1002/nme.1620170113).
The original paper's numerical table was not accessible for direct inspection.
The references below are independently computed, not claimed as a transcription.
Nanakorn & Vu (2006), *A 2D field-consistent beam element for large displacement
analysis using the total Lagrangian formulation*, FEAD 42, 1240–1247,
[Table 1, printed p.1245](https://www.imechanica.org/sites/default/files/1-s2.0-S0168874X06000953-main.pdf),
reproduces Mattiasson's values rounded to five decimals: .05643/.30172,
.16064/.49346, .38763/.71379, **.55500/.81061**. In particular, the sometimes
quoted .55559 shortening at load 10 is incorrect.

**Independent elliptic-integral solution.** Let t=s/L, q=PL²/EI, θ be the tangent
angle positive downwards, and α=θ(1). A fixed-direction downward tip force gives
θ″=−q cos θ, θ(0)=0, θ′(1)=0, hence θ′²=2q(sin α−sin θ).
Set m=(1+sin α)/2 and φ₀=asin(1/√(2m)). With elliptic integrals parameterized
by **m**, solve K(m)−F(φ₀|m)=√q on 0<α<π/2. Then

- u/L = 1−√(2 sin α/q), positive horizontal shortening;
- w/L = 1−2[E(m)−E(φ₀|m)]/√q, positive downward displacement.

[`research_references/elastica.py`](research_references/elastica.py) evaluates
these equations with mpmath (60 digits, repeated at 80 digits; agreement <1e−55),
and independently cross-checks them by solving the boundary-value ODE with
SciPy (`solve_bvp`, tolerance 1e−11; agreement <1e−11). Python dependencies are
only needed to regenerate references, not for Cargo tests.

| q | u/L (elliptic integrals) | w/L (elliptic integrals) | Superseded provisional u/L, w/L |
|---|---:|---:|---|
| 1 | 0.056433236283377 | 0.301720773799814 | .0566, .3015 |
| 2 | 0.160641720825167 | 0.493457480396712 | .1632, .4929 |
| 5 | 0.387628360724430 | 0.713791523611913 | .4054, .6647 |
| 10 | 0.554995597753751 | 0.810609024880296 | .5584, .6854 |

The old q=5 values differ from the independent solution by +4.585% in u
and −6.878% in w; at q=10 the old w is 15.446% too small. These errors
cannot be explained by mesh refinement or axial extension.

**Model audit.** L=2 m, E=200000 MPa (converted internally to 200000000 kN/m²),
I=1e−4 m⁴, so EI=20000 kN m² and P=5000q kN. The root is fixed; the tip's
nodal force is fz=−P, fx=my=0. The external load vector remains in global axes
through Newton iterations: this is a dead load, not a follower load. Tests use
signed −ux/L and −uz/L. No shear area is specified (Euler–Bernoulli).

The original A=.01 m² gives P/EA=.0025q (up to .025). It cannot be treated as
inextensible at sub-percent accuracy. An independent extensible Kirchhoff rod
uses reference coordinate t=s₀/L, stretch λ=1+(P/EA)sin θ,
θ″=−qλ cos θ, x′/L=λ cos θ, w′/L=λ sin θ, with the same angle boundary
conditions and x(0)=w(0)=0. The generator solves this BVP at 1e−10 and 1e−11
and requires displacement agreement <1e−11. Its inextensible limit independently
recovers the elliptic-integral values above.

| q | A=.01 BVP u/L | A=.01 BVP w/L | Axial effect on u, w versus inextensible |
|---|---:|---:|---|
| 1 | .055819791294775 | .302213694059550 | −1.087%, +.163% |
| 2 | .159261091516678 | .495690076153543 | −.859%, +.452% |
| 5 | .385373098137779 | .722663728094834 | −.582%, +1.243% |
| 10 | .552095793299974 | .830630993307244 | −.522%, +2.470% |

The main inextensible comparisons use A=1 m² at unchanged EI and q, reducing
P/EA to at most .00025. The independent BVP bounds the remaining effect on
either displacement by .025%. This is a numerical inextensible-limit model,
not a proposed physical section. `mattiasson_original_area_extensible` retains
all four original A=.01 loads, including 10, against the independent extensible
references at 64 elements with **.01%** relative tolerance.

**Refinement and stepping (unchanged production solver).** Full Newton,
max_iter=50, residual tolerance **1e−8** (previously 1e−6), 100 equal increments.
All loads reach full load factor 1. With A=1:

| q | 16 elements: u/L, w/L | 32 elements: u/L, w/L | 64 elements: u/L, w/L |
|---|---|---|---|
| 1 | .056390264074, .301755822611 | .056417887137, .301733219416 | .056424800265, .301727577718 |
| 2 | .160559370911, .493598617081 | .160610748895, .493509419755 | .160623626490, .493487173136 |
| 5 | .387554506869, .714191009969 | .387592725694, .713957487956 | .387602491723, .713899393714 |
| 10 | .554951581718, .811257540585 | .554962050362, .810920143486 | .554965330830, .810836602552 |

Worst relative errors against inextensible theory are .0801%, .0384%, .0281%.
The last includes the .02465% axial effect; against the A=1 extensible reference,
mesh error decreases approximately fourfold on doubling the mesh (second order).
Tests require **.1%, .05%, .03%** respectively and strictly improving error in
both signed displacements. These are all tighter than the original 2%.
For the original A=.01 model, maximum relative errors against its extensible
reference at 16/32/64 elements are .0665%/.0167%/.0042%.

At q=10, A=.01, the 16-element result with 100 increments is
(.552063170234, .831072959677); for A=1 it is (.554951581718, .811257540585).
20, 40, 100 and 200 increments all converge and agree within 2e−10 in normalized
displacement. Thus the old failure at 10 increments is an overly coarse load
path for unglobalized Newton, not a wrong full-load equilibrium. The permanent
step-independence test compares 20 and 100 increments for both areas at 1e−8
relative tolerance, requiring convergence and full load in every solve.
No solver tolerances were relaxed and no input refusals were introduced.

### Williams Toggle Frame
- **Source**: Williams (1964), "An approach to the non-linear behaviour of members of a rigid jointed plane framework"
- **Problem**: Symmetric two-bar toggle, apex load, snap-through behavior
- **Geometry**: Two bars meeting at shallow angle, pinned at base, load at apex
- **Critical Load**: Function of geometry and stiffness
- **Note**: Primarily tests convergence through snap-through, not a precise deflection benchmark

---

## Time Integration / Dynamics

### SDOF Free Vibration
- **Source**: Chopra, *Dynamics of Structures*, 5th Ed., Chapter 2
- **Problem**: SDOF system, free vibration after initial displacement
- **Key Result**: T = 2π√(m/k), amplitude constant (undamped) or decaying exponentially (viscous damping)

### SDOF Step Load — Dynamic Amplification Factor
- **Source**: Chopra, *Dynamics of Structures*, 5th Ed., Chapter 4
- **Problem**: Undamped SDOF under suddenly applied constant force F₀
- **Key Result**: DAF = u_max / u_static = 2.0 exactly (for undamped system)
- **Formula**: u(t) = (F₀/k)(1 - cos ωt), max when cos ωt = -1 → u_max = 2·F₀/k
- **Tolerance**: Should match 2.0 within 5%

### Newmark Energy Conservation
- **Source**: Newmark (1959), "A method of computation for structural dynamics"
- **Key Property**: Average acceleration (β=1/4, γ=1/2) is unconditionally stable and conserves energy for linear undamped systems
- **Test**: Run undamped free vibration for many periods, verify amplitude doesn't grow

### HHT-alpha Numerical Dissipation
- **Source**: Hilber, Hughes & Taylor (1977), "Improved numerical dissipation for time integration algorithms in structural dynamics"
- **Key Property**: α ∈ [-1/3, 0], introduces high-frequency damping without affecting low-frequency response
- **Test**: Compare late-time vs early-time amplitudes; HHT should show decay in high-frequency content

### Bathe SDOF Benchmarks
- **Source**: Bathe, *Finite Element Procedures*, 2nd Ed., Chapter 9
- **Problem**: SDOF spring-mass under step/impulse/sinusoidal loading
- **Note**: Exact solutions available for comparison with numerical integration

---

## Modal Analysis Properties

### Modal Orthogonality
- **Source**: Bathe, *Finite Element Procedures*, 2014, Ch. 10; Clough & Penzien, *Dynamics of Structures*
- **Property**: φᵢᵀ·M·φⱼ = 0 for i≠j (mass orthogonality)
- **Property**: φᵢᵀ·K·φⱼ = 0 for i≠j (stiffness orthogonality)
- **Test**: Reconstruct eigenvectors from modal displacements, compute cross products

### Rayleigh Quotient Upper Bound
- **Source**: Hughes, *The Finite Element Method*, 2000, Ch. 10
- **Property**: FE eigenvalues are upper bounds: ω_FE ≥ ω_exact
- **Property**: Monotonic convergence from above with mesh refinement
- **Cantilever exact**: ω₁ = (1.8751)² × √(EI/(ρAL⁴))

### Mass Conservation
- **Property**: total_mass from modal = Σ(ρ·A·L)/1000 (engine units)
- **Property**: Σ(m_eff) ≤ total_mass for all modes

---

## Convergence and Accuracy

### h-Convergence Rate
- **Source**: Bathe (2014), Hughes (2000)
- **Property**: Displacement error ∝ h² for cubic Hermite elements with UDL
- **Property**: Point loads at nodes are captured exactly by cubic elements
- **Test**: Measure error at n=2,4,8,16 and verify rate > 1.5

### Newmark Period Elongation
- **Source**: Newmark (1959); Chopra, *Dynamics of Structures*, Ch. 5
- **Property**: Average acceleration (β=0.25, γ=0.5) introduces period elongation: ΔT/T ≈ (π²/12)·(Δt/T)²
- **Test**: Impulse → free vibration, measure period from zero crossings

### Richardson Extrapolation
- **Property**: f_exact ≈ f(h/2) + (f(h/2) - f(h)) / (2^p - 1) for O(h^p) convergence
- **Test**: Extrapolated value should be closer to exact than either mesh

---

## Patch Tests

### MacNeal-Harder Standard Set
- **Source**: MacNeal & Harder, "A Proposed Standard Set of Problems to Test FEM Accuracy", FEM, 1985
- **Straight cantilever**: δ = PL³/(3EI), θ = PL²/(2EI) — should be exact for cubic elements
- **Tip moment**: δ = ML²/(2EI), θ = ML/(EI)

### Argyris-Kelsey Frame Patch Test
- **Source**: Argyris & Kelsey, "Energy Theorems and Structural Analysis", 1960
- **Property**: Irregular mesh should reproduce constant-stress states exactly
- **Test**: Axial load through irregular node spacing → constant N, zero V, zero M

---

## Pushover and Nonlinear

### Elastic Stiffness Checks
- **Cantilever**: k = 3EI/L³
- **Portal frame**: k_sway between 2×3EI/h³ (cantilever columns) and 24EI/h³ (rigid beam)

### P-Delta Amplification
- **Formula**: AF ≈ 1/(1 - P/P_cr)
- **Property**: Lateral displacement increases under axial compression
- **Near-critical**: AF > 2 at P/P_cr = 0.7

---

## Regulatory Features

### Inter-Story Drift (ASCE 7 §12.8.6)
- **Formula**: Δ = (δᵢ - δᵢ₋₁)/h
- **Test**: 3-story frame under lateral loads, verify positive drifts

### Superposition Principle
- **Property**: u(αF₁ + βF₂) = α·u(F₁) + β·u(F₂) for linear analysis
- **Property**: 2×P → 2×δ (load scaling linearity)

### Multi-Directional Seismic (EN 1998-1 §4.3.3.5)
- **Rule**: 100% in primary direction + 30% in orthogonal direction
- **Test**: Combined loading gives reasonable results vs individual directions

---

## Benchmark Status Summary

| Benchmark | Category | Solver Feature | Status | Notes |
|-----------|----------|----------------|--------|-------|
| Navier SS plate | Plates | DKT+CST, MITC4, MITC9 | DONE | MITC4 with ANS: 93% at 4×4, 95% at 16×16. MITC9: 98% at 2×2. |
| Roark ring | Curved beams | 3D curved | NEW | Full ring needed |
| VM18 quarter-circle | Curved beams | 3D curved | CAPABILITY | R=100in, δ=-2.648 |
| Plastic collapse 8Mp/L | Nonlinear | Bilinear N-R | CAPABILITY | Fixed-fixed, central P |
| VM14 eccentric column | Co-rotational | Large disp. | NEW | δ=0.1086in |
| Mattiasson elastica | Co-rotational | Large disp. | Verified #845 | Independent elliptic integrals, extensible BVP and mesh refinement |
| NAFEMS LE5 Z-section | Warping | 7th DOF | BLOCKED | Assembly not wired |
| Modal orthogonality | Mathematical | Eigensolver | DONE | φᵢᵀMφⱼ=0 verified |
| Rayleigh upper bound | Mathematical | Eigensolver | DONE | ω_FE ≥ ω_exact verified |
| Mass conservation | Mathematical | Mass matrix | DONE | ρAL/1000 verified |
| h-convergence O(h²) | Numerical | Linear solver | DONE | Rate > 1.5 verified |
| Newmark period elongation | Numerical | Time integration | DONE | <5% at Δt/T=0.02 |
| Richardson extrapolation | Numerical | Linear solver | DONE | Consistent results |
| MacNeal-Harder straight | Patch test | Frame elements | DONE | Exact for n=1 |
| Argyris-Kelsey frame | Patch test | Frame elements | DONE | Irregular mesh OK |
| Superposition principle | Linearity | Linear solver | DONE | u(F1+F2)=u(F1)+u(F2) |
| Inter-story drift | Regulatory | Linear solver | DONE | 3-story frame verified |
| RSA base shear bound | RSA | Spectral solver | DONE | V ≤ m·Sa·g |
| SRSS vs CQC | RSA | Spectral solver | DONE | Similar for separated modes |
| P-delta amplification | Nonlinear | P-delta solver | DONE | AF ≈ 1/(1-P/Pcr) |
| Corotational convergence | Nonlinear | Corotational | DONE | Large displacement OK |

## Research pages: production-engine CI coverage

The complete [inventory](RESEARCH_INVENTORY.md) records models, quantities, sources,
tolerances, existing matches, exclusions and audited PR commits. All new checks
are modules of the **validation** test binary (which engine CI already runs), not
research-only crates or formula-only `reference` tests. `R::` below means
`research_benchmarks::`; `S::` means `benchmarks::shell_benchmark::`.

| Research page | Engine test | Status |
|---|---|---|
| MacNeal–Harder #797: frame tip shear (1/2/4/8), moment displacement/rotation | `R::macneal_frame_shear_and_moment` | pass |
| MacNeal–Harder #797: regular MITC4, both load directions | `R::macneal_regular_in`, `R::macneal_regular_out` | pass |
| MacNeal–Harder #797: trapezoidal MITC4, both directions | `R::macneal_trapezoidal_in`, `R::macneal_trapezoidal_out` | ignored #798 |
| MacNeal–Harder #797: parallelogram MITC4, both directions | `R::macneal_parallelogram_in`, `R::macneal_parallelogram_out` | ignored #798 |
| Riks/Crisfield #803 / #846: true shallow truss through both limits | `R::riks_shallow_toggle` | pass — exact axial reference; strictly forward path through inversion |
| #846: original shallow frame | `R::riks_shallow_frame_energy_reference` | pass — independent two-frame energy reference |
| Riks/Crisfield #803: Von Mises peak load, displacement, every path step | `R::riks_von_mises_truss` | pass |
| Shell obstacle #809: Scordelis–Lo, 6²/8²/12²/16² | `S::research_roof_6`, `_8`, `_12`, `_16` | ignored #810 |
| Shell obstacle #809: pinched cylinder, 6²/8²/12²/16² | `S::research_cylinder_6`, `_8`, `_12`, `_16` | ignored #810 |
| Shell obstacle #809: hemisphere with hole, 4²/8²/16² | `S::research_hemisphere_4`, `_8`, `_16` | pass |
| Mattiasson #834: PL²/EI=1, signed u/L and v/L | `R::mattiasson_1` | pass |
| Mattiasson #834: PL²/EI=2/5/10 | `R::mattiasson_2`, `_5`, `_10` | pass — corrected independent references, model and stepping (#845) |
| Mattiasson #834: end moment, convergence/rotation only | `benchmarks::corotational_benchmarks_extended::validation_corotational_cantilever_end_moment` (existing) | pass |
| Ferrari–Sigmund #836: Roorda λ1, ten elements/member | `R::ferrari_roorda_numerical` | pass |
| Ferrari–Sigmund #836: reported closed form, forty/member | `R::ferrari_roorda_closed_form` | pass |
| Arches #835: first two thermal buckling modes, published 70% threshold | `R::arches::production_modes_and_published_threshold` | pass |
| Gridshell #837: exported frame volume and equilibrium | `R::fairclough_frame_equilibrium` | pass |
| Supplemental #818 (not the Roorda page result) | `R::buckling_818_exact_reference` | ignored #818 |

The continuous Fairclough volume **13.8394 ±0.00005** is an isolated Clarabel
optimization result, not a production-engine output. The engine test uses the
page's **0.2% frame discretization** and **1e-8 equilibrium** bounds. Its fixture
contains only curve coordinates and section areas from PR #837, not displacements,
forces or an optimizer dependency. Ferrari's **2.431355677** is pinned as a page
regression separately from the paper's rounded **2.4313 ±0.0001**.

The MacNeal frame checks above enforce true relative error; the older shared
`assert_close` helper's `max(reference,1)` denominator was too permissive for these
small displacements. No engine implementation changed. Existing shell benchmark checks
now also enforce the response direction (signed displacements against signed
references), keeping their magnitude tolerances. #846 later strengthened the limit-point validation, again
without engine changes.
No issue-specific containment exists on audited main for #798/#810/#818; therefore
there are no passing warning tests pretending those results are contained.

### New findings from the page-level assertions

These failures already have evidence on the PR pages but lacked engine CI accuracy
checks. They are tagged `new finding` pending reference/model/solver triage, not
claimed as newly proven engine implementation defects. The Mattiasson rows below preserve the historical evidence; #845 resolves them
with independent references and model/step checks documented above.

| Case | Reference | Observed | Difference / failure |
|---|---|---|---|
| Mattiasson parameter 2 | u/L=.1632, v/L=.4929 | .159191217090994, .495808283572916 | u −2.456%; v +.590% (2% target) |
| Mattiasson parameter 5 | u/L=.4054, v/L=.6647 | .385315745120409, .722972888603782 | u −4.954%; v +8.767% (2% target) |
| Mattiasson parameter 10 | u/L=.5584, v/L=.6854 at full load | .055782722292224, .302243546485185 at load factor .1 | nonconverged; partial response is not accepted |
| Riks shallow toggle (historical finding, resolved #846 below) | axial peak P=95.98504891452458 at v=.04228900098628047 | frame final/highest P=48.749999866981085 at v=.0024736193991736002 | mismatched reference and insufficient path budget; the frame has no limit over inversion |

### Verification of this audit

All Cargo invocations used `CARGO_TARGET_DIR=/private/tmp/claude-501/codex-bench-target`,
`CARGO_BUILD_JOBS=2`, `nice cargo test -p dedaliano-engine --test validation`.

| Filter / options | Result |
|---|---|
| `research_benchmarks -- --nocapture` | 9 passed, 9 ignored |
| `benchmarks::shell_benchmark -- --test-threads=2` | 69 passed, 8 ignored (includes three new hemisphere checks) |
| `benchmarks::corotational_benchmarks -- --test-threads=2` | 13 passed |
| `research -- --ignored --nocapture --test-threads=2` | All 17 deliberately failed the intended accuracy/convergence assertions; no unexpected passes |

This adds 35 tests: **18 active, 17 ignored** (13 known-issue cases and four
findings later traced to wrong benchmark references, fixed in #849 and #852); the
six defensive tests (non-finite path samples, reversed responses) were added after
the filter counts in the table above were recorded. The ignored #818 case returned 4691.397553909858 against 4688.920345,
a relative error of 0.000528311 versus the required 0.000001.
`python3 -I scripts/check-test-targets.py` passes: all files belong to one binary.
`make check.changelog NIX_RUN=` passes with local Python; plain
`make check.changelog` could not open Nix's cache lock under the sandbox.

### Shallow-toggle resolution (#846)

**Verdict: benchmark model/reference and path-budget errors; no production-engine
change.** The original model has two frame elements with an unreleased apex and
pinned bases, not a two-bar truss. The corrected axial benchmark explicitly uses
`type: "truss"`. A separate test preserves the original frame geometry, section,
joints and supports and checks its discrete energy law. This is an independent
reference for the two-element formulation, not a claim of continuum mesh convergence.

Use downward apex displacement `v`, current rise `y=h−v`, `a=2 m`, `h=.1 m`,
`L=sqrt(a²+y²)`, `L0=sqrt(a²+h²)=2.0024984394500787 m`, `EA=2,000,000 kN` and
`EI=20,000 kN m²` (the engine converts E from MPa to kN/m²).

For the truss, engineering strain gives `N=EA(L−L0)/L0`. Vertical equilibrium gives
`P=−2Ny/L=2EA(1−L/L0)y/L`. Differentiating with respect to `y` gives
`dP/dy=2EA(a²/L³−1/L0)`, so
`L*=cbrt(a²L0)` and `y*=sqrt(L*²−a²)`. Thus the two limits are:

| Limit | P (kN) | v (m) |
|---|---:|---:|
| Upper | 95.98504891452458 | .04228900098628047 |
| Lower | −95.98504891452458 | .15771099901371953 |

For the frame, symmetry sets the apex rotation to zero. Let
`β=atan(y/a)−atan(h/a)`. Minimizing each member's Euler–Bernoulli bending energy
with respect to its free base rotation gives base rotation `3β/2` (opposite sign
on the other side). Each member contributes `3EIβ²/(2L0)`. The two-member energy
and its derivative are therefore

```
U(v) = EA(L−L0)²/L0 + 3EIβ²/L0
Pframe(v) = dU/dv = 2EA(1−L/L0)y/L − 6EI a β/(L0 L²)
dPframe/dv = 2EA(1/L0−a²/L³) + 6EI a(a−2yβ)/(L0 L⁴)
```

On `0≤v≤2h`, the last expression has the strictly positive lower bound
`2EA(1/L0−1/a)+6EI a[a−4h atan(h/a)]/L0⁵ = 12262.393829 kN/m`.
Consequently **this frame has no limit point over inversion**. A Python scratch
calculation independently differentiated `U` by central differences (`dv=1e-6 m`)
and checked the force formula:

| v (m) | Truss P (kN) | Frame formula P (kN) | Numerical dU/dv (kN) |
|---:|---:|---:|---:|
| .0024736193991736002 | 11.869521681 | 48.749671363 | 48.749671347 |
| .04228900098628047 | 95.985048915 | 727.995663060 | 727.995662817 |
| .1 | 0 | 1496.881937216 | 1496.881937214 |
| .2 | 0 | 2986.298129110 | 2986.298129088 |

The old frame output `P=48.749999867` at `v=.0024736193991736002` differs from its
correct frame reference by only `6.739e-6` relative, consistent with the old
`1e-5` convergence tolerance. The purported 38.423% path error was bending force
compared against an axial-only reference.

The solver's spherical metric is `||Δu||²+(Δλ)²||fref||²=ds²`. With `||fref||=50`,
the old `ds≤.5`, 100-step budget can advance by at most 50 kN from zero (48.75 kN
with its adaptive startup). It could not reach even the *truss* upper limit.
The final truss setup uses initial `ds=.05`, maximum `.25`, minimum `1e-8`, 2000
steps, 30 iterations, target 5 iterations and convergence tolerance `1e-10`.
Every prefix reproduces the full solve's steps exactly. All 1999 successive apex
increments are positive (minimum `2.0087117013e-5 m`): the path does not turn back
before either limit. It finishes at `P=116.050047789 kN`, `v=.218102302721 m`, past
both limits and the unloaded inverted state `v=.2`. The sampled lower limit is
`−95.949912340 kN`. All 2000 steps converge, using 4334 total Newton iterations
and at most 8 iterations in any accepted step. A separate scratch executable
reproduced the original 100-step frame output exactly (127 iterations total).

Measured maximum `|P−Pexact|/Pupper` is `8.240604e-11`; the enforced bound is
`1e-8` (one hundred times above measured numerical error, far below 1%). The
sampled upper peak is `95.799984246 kN` at `.040231221403 m`. A local quadratic
through the three adjacent computed points locates the peak at `95.990235905 kN`,
`.042317985359 m`: errors `.005404%` and `.068539%`, respectively, both below the
new `.1%` bounds. The separate limit-point validation checks both sampled extrema
within `.2%`, full convergence and final inversion; it can no longer pass merely
because some positive load was obtained. The original 5% sampled-peak checks are
also retained. A preliminary `.5` maximum-step run already followed the complete
path with residual `6.802e-11`, but its quadratic peak-displacement error was
`.100084%`; refining the step resolved this without relaxing a bound.

The frame reference test uses 160 steps of `ds=25` and `1e-10` convergence
tolerance. Every sampled force agrees with the energy derivative within
`9.740897e-11` relative (enforced bound `1e-8`), and displacement advances to
`.243420170514 m`.

Verification on `fix/846-shallow-toggle` uses
`CARGO_TARGET_DIR=/private/tmp/claude-501/codex-fix846-target`, `CARGO_BUILD_JOBS=2`
and `nice cargo test -p dedaliano-engine` (the sandbox reports
`nice: setpriority: Operation not permitted`, but runs the command):

| Filter | Result |
|---|---|
| `--test validation research_benchmarks -- --nocapture` | 11 passed, 8 unrelated ignored |
| `--test validation domains::solver::arc_length -- --nocapture` | 13 passed |
| `--test validation domains::nonlinear::nonlinear_extended -- --nocapture` | 8 passed |

`make NIX_RUN= check.changelog` passes; the default Nix wrapper cannot write its
cache lock in this sandbox. `make NIX_RUN= check.results-snapshot-gate
BASE=test/engine-benchmarks` passes with zero snapshot files touched. No engine
code or saved-model results changed, so no results-version registration is needed.

The complete engine suite finished with **8442 passed, 0 failed, 60 ignored**
across the library and all 13 integration binaries; doc-tests also succeeded
(0 tests). All ignores are pre-existing; this change removes one ignore.
The initial debug suite completed the library, certificates, core, derivations,
elements, gates and integration groups. Its slow unoptimized metamorphic run was
interrupted and the entire metamorphic binary rerun with
`cargo test -p dedaliano-engine --release --test metamorphic -- --test-threads=2`
(19 passed, 5 ignored), matching `Makefile::test.engine.metamorphic`'s release
configuration. The remaining binaries ran with
`cargo test -p dedaliano-engine --test property --test reference --test robustness
--test shells --test solver --test validation -- --test-threads=2`, followed by
`cargo test -p dedaliano-engine --doc`. The full validation binary had 4777 passed
and 16 ignored. No test selection or assertion was reduced for the release run.

### Issue #845 verification

Commands use `CARGO_TARGET_DIR=/private/tmp/claude-501/codex-fix845-target`,
`CARGO_BUILD_JOBS=2`, and `nice cargo test -p dedaliano-engine`.
The sandbox rejects `nice`'s priority adjustment, but Cargo executes normally.
Targeted validation (default workspace test profile):

| Filter (`--test validation`) | Passed | Failed | Ignored |
|---|---:|---:|---:|
| `research_benchmarks -- --nocapture` | 14 | 0 | 6 (unrelated existing findings) |
| `domains::nonlinear::corotational` | 15 | 0 | 0 |
| `capability_upgrades` | 5 | 0 | 0 |

The standalone Python generator passes precision and independent ODE cross-checks.
`make check.changelog NIX_RUN=`, `make check.test-targets NIX_RUN=`, and
`make check.results-snapshot-gate NIX_RUN= BASE=test/engine-benchmarks` pass;
the snapshot gate reports zero changed snapshot files. No engine source or
user-model results change, so no `result-changes.json` entry is appropriate.

For the complete engine suite, set `CARGO_PROFILE_TEST_OPT_LEVEL=1`: Cargo ignores
the identical `[profile.test] opt-level=1` declared in the engine member because
profiles must be set at the workspace root. The initial unoptimized run was
interrupted in the long 3D metamorphic test, after 1,782 tests in completed groups
passed without failures; the complete rerun uses optimization without changing
any tests, assertions, tolerances or filters.

The complete optimized run exited successfully: **8,445 passed, 0 failed,
58 existing ignored**, across the unit tests and all 13 integration-test binaries;
doc-tests contained zero tests. The validation binary alone reports 4,780 passed,
0 failed, 14 ignored. All six Mattiasson tests are active and pass. The final
snapshot gate, changelog check and `git diff --check` also pass.
