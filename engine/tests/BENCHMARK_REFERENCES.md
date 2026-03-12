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
- **Source**: Mattiasson (1981), "Numerical results from large deflection beam and frame problems analysed by means of elliptic integrals", Int. J. Numer. Meth. Engng., 17, 145-153
- **Problem**: Cantilever beam, length L, tip load P, dimensionless load P·L²/(EI)
- **Reference Table** (P·L²/(EI) → u_tip/L, v_tip/L):
  - 1.0 → u/L = 0.0566, v/L = 0.3015 (from Mattiasson Table 1)
  - 2.0 → u/L = 0.1632, v/L = 0.4929
  - 5.0 → u/L = 0.4054, v/L = 0.6647
  - 10.0 → u/L = 0.5584, v/L = 0.6854
- **Note**: Need to verify exact table values from the original paper

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
| Mattiasson elastica | Co-rotational | Large disp. | NEW | Need paper values |
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
