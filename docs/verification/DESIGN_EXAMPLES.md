# Design checks against published worked examples

The certified enclosures ([CERTIFY.md](CERTIFY.md), `engine/src/certify/design.rs`) prove that a
design check's numbers are what its formulas give. They do not prove that the formulas are the
code clauses. This document records the second question: every implemented design check, clause
by clause, against a worked example someone else published, comparing the example's printed
intermediate values (λ, χ, Fcr, Lp, Lr, Mcr, Cv, Vc …) as well as its final resistance.

Tests:

- Rust checks: [`engine/tests/design_worked_examples.rs`](../../engine/tests/design_worked_examples.rs)
- TypeScript checks, next to their implementations:
  - [`web/src/lib/engine/codes/argentina/__tests__/cirsoc301-worked-examples.test.ts`](../../web/src/lib/engine/codes/argentina/__tests__/cirsoc301-worked-examples.test.ts)
  - [`web/src/lib/engine/codes/argentina/__tests__/cirsoc201-inti-examples.test.ts`](../../web/src/lib/engine/codes/argentina/__tests__/cirsoc201-inti-examples.test.ts)
  - [`web/src/lib/connection/__tests__/fillet-weld-inti.test.ts`](../../web/src/lib/connection/__tests__/fillet-weld-inti.test.ts)
  - [`web/src/lib/connection/__tests__/bolted-joint-inti.test.ts`](../../web/src/lib/connection/__tests__/bolted-joint-inti.test.ts)

## Rules

- **Inputs are the example's printed inputs**, in its units. Where a check wants a property the
  example does not print, it is derived from printed ones and the derivation is written in the
  test (e.g. Iy = 2·Sx·rts²/ho, Cw = Iy·ho²/4 to reproduce a printed rts and ho), or it does not
  enter the tested quantity and is marked unused. One exception, stated in the test: AISC H.3's
  ry, rts, ho, J come from Manual Table 1-1, and the test first requires them to reproduce the
  example's printed Lp and Lr.
- **Tolerance is the published rounding**: examples print three significant figures and reuse
  rounded intermediates, so the default band is 0.5 % relative. Where an example prints fewer
  figures (χ = 0.65) the band is that resolution, and the test says so.
- **No invented numbers.** A clause with no published example found is listed as uncovered.
- **Every disagreement is classified**: stabileo, the example, or the code clause. A stabileo bug
  gets an ignored reproduction; when the fix was contained it is fixed, the reproduction becomes
  the regression test, and the CHANGELOG carries it under BREAKING (results).

## Sources

| Key | Document |
|---|---|
| AISC | AISC, *Companion to the AISC Steel Construction Manual, Vol. 1: Design Examples*, v16.0, first-semester edition (2023), ANSI/AISC 360-22. Page numbers are the examples' (D-3, F-11, …). |
| SBE | SCI/CTICM, *Steel Buildings in Europe — Multi-Storey Steel Buildings, Part 4: Detailed Design* (2010), Appendix A worked examples. |
| SBE-MS8 | SCI/CTICM, *Steel Buildings in Europe — Multi-Storey Steel Buildings, Part 8: Design software — Section Capacity* (2010), Appendix A, Worked Example 2. https://www.steelconstruction.info/images/8/8f/SBE_MS8.pdf |
| SBE-SS4 | SCI/CTICM, *Steel Buildings in Europe — Single-Storey Steel Buildings, Part 4: Detailed Design of Portal Frames* (2010), Appendix D. https://www.steelconstruction.info/images/b/b8/SBE_SS4.pdf |
| P364 | M. E. Brettle, A. L. Smith, *Steel Building Design: Worked Examples — Open Sections*, SCI P364 (2009), BS EN 1993-1-1 + UK NA. |
| JRC-EC2 | F. Biasioli, G. Mancini, M. Just, M. Curbach, J. Walraven et al., *Eurocode 2: Background & Applications — Design of Concrete Buildings, Worked examples*, JRC report EUR 26566 EN (2014), ch. 3 (Walraven & Gmainer). |
| INTI201 | V. Hernández Balat, J. F. Bissio, D. A. Ortega, *Ejemplos de Aplicación del Reglamento CIRSOC 201-2005*, INTI-CIRSOC (Aug. 2005). |
| INTI301 | G. Troglia, D. Troglia, J. Angulo Bocco, *Ejemplos de Aplicación del Reglamento CIRSOC 301-2018*, INTI-CIRSOC (Jul. 2018). |

## Inventory of design checks

| Check | Code | Where | Clauses implemented |
|---|---|---|---|
| `steel_check` | AISC 360-16/22 LRFD | Rust | D2 tension (yield, rupture with An·U), E3 flexural buckling, F2 yielding + LTB (Lp, Lr, F2-2/F2-4, Cb input), F3 / F6.2 flange local buckling (new, optional `flangeSlenderness`), F6 minor axis, G2.1 shear (φv = 0.90, Cv1 input), H1-1 interaction |
| `ec3_check` | EN 1993-1-1 | Rust | Class-dependent W/A (6.2), 6.2.3 / 6.2.4 axial, 6.2.5 bending, 6.2.6 shear (Av input), 6.3.1 flexural buckling (curves a–d), 6.3.2.2 LTB general case with Mcr(C1, zg = 0), 6.3.3 interaction (6.61)/(6.62) with Annex B factors (Cm input, default 1.0) |
| `ec2_check` | EN 1992-1-1 | Rust | 3.1.7 rectangular block flexure (singly, doubly with one-step compression steel), 6.2.2 VRd,c with k1·σcp, 6.2.3 VRd,s and VRd,max (cot θ 1–2.5) |
| `rc_check` | ACI 318-19 | Rust | 22.2 Whitney block flexure (rectangular, doubly, T-beam), P–M point at Nu by strain compatibility, 21.2.2 φ, 22.5.5.1 Vc table with λs, Vs ≤ 0.66√f'c·bw·d |
| `cirsoc201_check` | CIRSOC 201-2005 | Rust | Flexure (Whitney, doubly), 9.3.2 φ, 11.3.1.1 Vc, 11.5.7.9 Vs cap |
| `connection_check` | AISC 360 (elastic method) | Rust | Bolt group elastic method with φRn input; fillet weld group elastic method, Fnw = 0.60·FEXX, J2.2b(d) end-loaded β |
| `cfs_check` | AISI S100 | Rust | Effective width, flexure with LTB, compression with distortional interaction, combined |
| `timber_check` | NDS | Rust | 3.3 bending with CL, 3.4 shear, 3.6/3.7 compression with CP, 3.8 tension, 3.9 combined |
| `masonry_check` | TMS 402 | Rust | 9.3.4 axial with slenderness, 9.3.5 flexure, 9.3.6 shear, interaction |
| `foundation_check` | Bearing capacity + ACI 318 | Rust | Terzaghi/Meyerhof bearing, overturning, sliding, one-way and punching shear (22.6.5.2) |
| `cirsoc301.ts` | CIRSOC 301-2018 | TS | D tension (Ae = Ag), E.3/E.7 flexural buckling with Q (φc = 0.85), F.2 (Mp ≤ 1.5My, LTB in X1/X2 form, load height), F.3/F.4/F.5 noncompact and slender flanges/webs, F.6 minor axis with F.6.2, G.2.1 shear, H.1 interaction; refuses shapes it cannot classify |
| `cirsoc201.ts` | CIRSOC 201-2005 | TS | Flexure design (singly/doubly), 11 shear design, columns, torsion, biaxial, slenderness |
| `cirsoc-flex*.ts` | CIRSOC 201 | TS | Section/interaction engine (already tested against the INTI CIRSOC_FLEX workbook, `cirsoc-flex-worked-examples.test.ts`) |
| `fillet-weld.ts` | CIRSOC 301-2018 J.2 | TS | J.2.2 throat, J.2.4 strength (φ = 0.60), Tabla J.2.4 min leg, max leg, 4w, J.2.1 β |
| `bolted-joint.ts` | CIRSOC 301-2018 J.3 | TS | J.3.6 shear/tension, J.3.7 combined, J.3.10 bearing, J.3.3/J.3.4 geometry |
| `codes/cirsoc201/*` | CIRSOC 201-2025 | TS | Detailing: anchorage, crack control, spacing, cages, placement |

## Coverage

Status: **pass** — stabileo reproduces the printed values at the stated rounding;
**fixed** — it did not, the fix is in this branch and the example is the regression test;
**open** — disagreement not fixed, ignored/skipped reproduction in the test file;
**doc** — passes, with a documented deliberate deviation; **ex** — the example is at fault.

### AISC 360 (`steel_check`, Rust)

| Clause | Example | Printed values compared | Status |
|---|---|---|---|
| D2-1 yielding | AISC D.1 (pp. D-2–D-4) | φtPn = 277 kips | pass |
| D2-2 rupture, D3 Ae = An·U | AISC D.1 | Pn = 281, φtPn = 211 kips (governs) | pass |
| E3-2 inelastic buckling | AISC E.1C (pp. E-8–E-9) | φcFn = 23.0 ksi, φcPn = 892 kips | pass |
| E3-2, major axis governs | AISC E.1D (pp. E-10–E-12) | Fn = 38.9 ksi, Pn = 1,030, φcPn = 927 kips | pass |
| E3-3 elastic buckling | INTI301 Ej. 10(a) (same equation, Pn compared) | Fcr = 46.0 MPa, Pn = 247.4 kN | pass |
| F2-1 yielding | AISC F.1-1B (p. F-8) | Mp = 5,050 kip-in, φbMn = 379 kip-ft | pass |
| F2-5 Lp, F2-6 Lr, F2-2 inelastic LTB | AISC F.1-2B (pp. F-10–F-11) | Lp = 69.9 in, Lr = 203 in, Mn = 4,060 kip-in, φbMn = 304 kip-ft | pass |
| F2-3/F2-4 elastic LTB | AISC F.1-3B (pp. F-14–F-15) | Fcr = 43.2 ksi, Mn = 3,840 kip-in, φbMn = 288 kip-ft | pass |
| F3-1 flange local buckling | AISC F.3B (pp. F-24–F-25) | Mn = 5,310 kip-in, φbMn = 398 kip-ft | **fixed** (D1) |
| F6-1 minor axis | AISC F.5 (pp. F-28–F-29) | Mn = 1,630 kip-in, φbMn = 122 kip-ft | pass |
| G2-1 shear | AISC G.1B (p. G-4) | Aw = 10.2 in², Vn = 306 kips | doc (D9: φv = 0.90 not 1.00) |
| H1-1b with tension, F2-2 with Cb, F6-1 | AISC H.3 (pp. H-8–H-11) | Lp = 8.76, Lr = 33.2 ft, φtPn = 1,080, Mnx = 6,560 kip-in, φbMnx = 492, φbMny = 168 kip-ft, Pr/Pc = 0.161, H1-1b = 0.873 | pass (Cb = 1.41 of H1.2 passed in) |
| H1-1a | — | AISC H.1B needs Table 6-1 capacities of a W14×99 whose flanges are noncompact; not reproducible without F3/F6.2 inputs not printed | uncovered |
| E4 torsional, E7 slender elements, F4/F5, G2.2 tension field, H1.2 Cb for tension | — | not implemented | uncovered (not implemented) |

### EN 1993-1-1 (`ec3_check`, Rust)

| Clause | Example | Printed values compared | Status |
|---|---|---|---|
| 6.2.5 Mc,Rd (Class 1) | SBE A.1 (pp. 4-57–4-62), SBE A.2 (pp. 4-64–4-69) | Mc,Rd = 189.01 / 307.15 kNm; ratios 0.479 / 0.798 | **fixed** (D4: Lb = 0 was NaN) |
| 6.2.6 Vpl,Rd | SBE A.1, A.2 | Vpl,Rd = 417.9 / 579.21 kN | pass |
| 6.2.4 / 6.2.3 A·fy/γM0 | P364 Ex. 9 | Nc,Rd = 5658 kN | pass |
| 6.3.1 χ, Ncr, Nb,Rd | SBE A.5 (pp. 4-94–4-97) | χy = 0.808, χz = 0.671, Nb,Rd = 2349.5 kN, ratio 0.85 | pass |
| 6.3.1, Class 3 | P364 Ex. 9 (sheets 1–6) | χz = 0.65, Nb,z,Rd = 3678 kN, Blue Book Nb,y,Rd = 5010 kN | pass |
| 6.3.2 LTB | SBE A.1; P364 Ex. 3, 4, 5, 12 | — | uncovered: the examples load the top flange (zg ≠ 0) and/or use 6.3.2.3 with f, or take Mcr from LTBeam without printing It/Iw; stabileo implements 6.3.2.2 with zg = 0 (D10) |
| 6.3.3 / Annex B (Table B.2) kyy, kzy, (6.61), (6.62) | SBE-MS8 Ex. 2 (pp. 8-18–8-22) | λ̄y = 0.12, λ̄z = 0.540, χz = 0.865, Nb,y,Rd = 3507, Nb,z,Rd = 3034 kN, kyy = 0.997, kzy = 0.997, (6.61) = 0.647, (6.62) = 0.653 | **fixed** (D11); equations compared with the printed Mb,Rd (6.3.2.3, D10) |
| Annex B with Cm < 1, both kzy branches | SBE-SS4 App. D column (pp. 4-97–4-103) | CmLT = 0.888 → kzy = 0.996, (6.62) = 0.832; CmLT = 0.6 → kzy = 0.977, 0.758; Cmy = 0.6 → kyy = 0.605, (6.61) = 0.625 | pass |
| Annex B kyz, kzz (biaxial) | — | no free published Annex B example with Mz,Ed ≠ 0 found | uncovered |
| 6.3.1.4 torsional buckling | P364 Ex. 9 | Nb,T,Rd = 4017 kN | uncovered (not implemented; does not govern) |

### EN 1992-1-1 (`ec2_check`, Rust)

| Clause | Example | Printed values compared | Status |
|---|---|---|---|
| 3.1.7 / 6.1 MRd, singly | JRC-EC2 §3.2.1.3 (pp. 57–58) | (MEd, As) = (89.3 kNm, 556 mm²) and (132.9, 947); z/d = 0.9925, 0.867 | pass |
| 6.2.2 VRd,c | JRC-EC2 §3.2.1.4 (p. 59) | k = 1.73, ρl = 0.0061, VRd,c = 47.90 kN | pass |
| 6.2.2, ρl ≤ 0.02 | JRC-EC2 §3.2.3.3 (p. 90) | VRd,c = 69 kN | pass; **ex** (D12: printed fck as 16.7) |
| 6.2.3 (6.9) VRd,max | JRC-EC2 §3.2.1.4 (p. 60) | ν = 0.54, VRd,max = 259.8 kN | pass |
| 6.2.3 (6.8) VRd,s | JRC-EC2 §3.2.1.4 (p. 60) | asw = 317 mm²/m ↔ VEd,red = 115.52 kN | pass |
| Doubly reinforced, axial (k1σcp) | — | — | uncovered |

### ACI 318-19 (`rc_check`) and CIRSOC 201-2005 (`cirsoc201_check`), Rust

| Clause | Example | Printed values compared | Status |
|---|---|---|---|
| Whitney block, β1, φ (ACI 22.2, 21.2.2; CIRSOC 10.2, 9.3) | INTI201 Ej. 2.I.6 (p. 25) | a = 0.06621 m, kc = 0.213, φ = 0.90, Mn = 56.20 kNm | pass (both) |
| Doubly reinforced, strain compatibility | INTI201 Ej. 2.I.7 (p. 27) | Mn = 57.40 kNm | **fixed** (D2, both checks) |
| CIRSOC 11.3.1.1 Vc, 11.5.7.9 Vs cap | INTI201 Ej. 3.I (pp. 52–53) | Vc = 85.8 kN, Vs = 147 kN, φVn = Vu = 174.6 kN, cap 342.9 kN | **fixed** (D3) |
| ACI 318-19 22.5.5.1 Vc (table, λs) | — | INTI's shear is 2005-edition; no SI ACI 318-19 shear example found | uncovered |
| T-beam, P–M interaction | — | — | uncovered |

### Connections (`connection_check`, Rust)

| Clause | Example | Printed values compared | Status |
|---|---|---|---|
| Weld group, elastic method (J.1.1), J.2.4 | INTI301 Ej. 3 (Ej. 3-1–3-2) | Aw = 70, f = 143.68 MPa per unit leg, Rd = 12.22 kN/cm, dw = 1.18 cm | pass (D13: 1.1 % lever-arm convention) |
| Fillet weld J2.4, J2.2b(d) β | AISC J.1 (pp. J-2–J-4) | 5.57 kip/in, β = 0.912, φRn = 206 kips | **fixed** (D5) |
| Bolt group elastic method | — | AISC's eccentric-bolt examples use the IC method | uncovered |

### CIRSOC 301-2018 (`cirsoc301.ts`, TS)

| Clause | Example | Printed values compared | Status |
|---|---|---|---|
| E.3-3 elastic | INTI301 Ej. 10(a) | kL/r = 194, Fcr = 46.0 MPa, Rd = 210.3 kN | pass |
| E.3-2 inelastic | INTI301 Ej. 10(b) | kL/r = 111.9, Fcr = 126.04 MPa, Pd = 221.2 kN | pass |
| E.7 slender elements (Q) | INTI301 Ej. 10(c) | Q = 0.794, Fcr = 135.70 MPa, Pd = 204.7 kN | **fixed** (D6); Q, Fcr at 1 % (2005 vs 2018 E.7.17), D17 |
| F.2.1 Mp | INTI301 Ej. 14, V1 | Mp = 43.95 kNm | pass |
| G.2.1 Cv = 1 | INTI301 Ej. 14, V1 | Vn = 175.1, Vd = 157.6 kN | pass |
| G.2.1 elastic web buckling, built-up Aw | INTI301 Ej. 14, V2 | Cv = 0.336, Vn = 144.7, Vd = 130.3 kN | **fixed** (D7) |
| F.4 noncompact flange/web | INTI301 Ej. 14, V2 | Mp = 362.2, Lp = 162.4, Lr = 711.2 cm, Mn = 317.9, Md = 286.1 kNm | **fixed** (D8) |
| F.5 slender web | INTI301 Ej. 14, V3 | Lp = 307.4, Lr = 1223.6 cm, Mn = 857.2, Md = 771.4 kNm | pass (new) |
| F.2.2 LTB, top-flange load (F.2-4b/5b/6b) | INTI301 Ej. 14, V1 case I-B | Lp = 79.1, Lr = 335 cm, Mcr = 20.43, Md = 18.39 kNm | **fixed** (D8) |
| F.2-2 inelastic LTB, FL = Fy − 69 | INTI301 Ej. 14, V1 braced at midspan | Cb = 1.298, Mn = 42.12, Md = 37.91 kNm | pass (new) |
| H.1 interaction | INTI301 Ej. 16 | box section with slender walls; the checker models I-sections only | uncovered |

### CIRSOC 201-2005 (`cirsoc201.ts`, TS)

| Clause | Example | Printed values compared | Status |
|---|---|---|---|
| Flexure design, singly | INTI201 Ej. 2.I.1 (p. 17) | d = 0.366, ka = 0.18655, kc = 0.219, As = 4.15 cm² | pass |
| 11.3.1.1 Vc, 11.5 stirrups, 11.5.6.3 minimum | INTI201 Ej. 3.I (pp. 52–53) | Vc = 85.8, Vs = 147 kN, Av/s = 609 mm²/m, min 159 mm²/m | pass; **ex** (D14) |
| Doubly design, T-beams, columns, torsion, slenderness | INTI201 Ej. 2.I.3/2.I.4, 2.II, 4.I, 5.x | — | uncovered in this pass (examples exist; next step) |

### Connections (TS)

| Clause | Example | Printed values compared | Status |
|---|---|---|---|
| J.2.4 fillet strength, J.2.1 β | INTI301 Ej. 2 (Ej. 2-2–2-3) | Fnw = 288 MPa, φ = 0.60, 55 kN per 11.3 cm run | pass |
| Tabla J.2.4 min leg, J.2.2(b) max leg | INTI301 Ej. 2 | min 5 mm, max 4.4 mm, adopted 4 mm | **ex** (D15) |
| J.3.6 bolt shear | INTI301 Ej. 1 (Ej. 1-4) | Ab = 1.98 cm², Rd = 61.63 kN/bolt | pass |
| J.3.10 bearing | INTI301 Ej. 1 (Ej. 1-5–1-6) | Rd = 55.95 kN end bolt, 179.2 kN group | **ex** (D16) |

### Not covered

`cfs_check` (AISI S100), `timber_check` (NDS), `masonry_check` (TMS 402), `foundation_check`, and
the CIRSOC 201-2025 detailing modules (`codes/cirsoc201/*`) have no published worked example in
this pass: the free AISI/AWC/TMS example collections were not located, and the detailing rules
are geometric limits rather than resistances. They remain covered only by the hand-derived
tests in `engine/tests/integration/` and `web/src/lib/codes/cirsoc201/__tests__/`.

## Discrepancies

| # | Where | Finding | Cause | Status |
|---|---|---|---|---|
| D1 | `steel_check` F3 | W21×48 (bf/2tf = 9.47 > λpf = 9.15) kept Mp: φbMn = 401 vs 398 kip-ft (+0.8 %, unsafe) | stabileo: no flange slenderness input, every flange taken as compact | **fixed**: optional `flangeSlenderness` enables F3-1/F3-2 (kc = 0.35 lower bound) and F6-2/F6-3 |
| D2 | `rc_check`, `cirsoc201_check` doubly reinforced | Mn = 56.21 (ACI) / 56.97 (CIRSOC) vs 57.40 kNm | stabileo: neutral axis from the "A's yields" trial, never iterated; reported state satisfied neither compatibility nor the trial | **fixed**: bisection on c, shared helper |
| D3 | `cirsoc201_check` shear | Vc 87.4 vs 85.8 kN (+1.9 %, unsafe) | stabileo: ACI 318M's 0.17 instead of CIRSOC 201-2005's 1/6 (and 0.66 for 2/3); φ transition at fixed 0.002 | **fixed** |
| D4 | `ec3_check` | Lb = 0 → Mcr = c/0, χLT NaN, strong-axis check unevaluated | stabileo | **fixed**: χLT = 1 for Lb = 0 |
| D5 | `connection_check` welds | AISC J.1: φRn 225 vs 206 kips (+9.5 %, unsafe) for l/w = 144 | stabileo: no J2.2b(d) end-loaded β | **fixed**: β (and Le = 180w beyond 300w) per segment; `endLoaded` defaults to true (conservative), `false` opts out |
| D6 | `cirsoc301.ts` compression | slender box: φPn 237.4 vs 204.7 kN (+16 %, unsafe) | stabileo: no §E.7 Q | **fixed**: Q from E.7.1/E.7.2 with Table B.4.1a, `shape` selects the elements; unclassifiable shapes refused |
| D7 | `cirsoc301.ts` shear | V2 (h/tw = 138): Cv 0.536 vs 0.336, φVn 207.8 vs 130.3 kN (+60 %, unsafe) | stabileo: AISC 360-10 rule (2.24√(E/Fy), kv = 5.34), no G.2.5, Aw = total depth for built-up | **fixed**: G.2.3–G.2.5 with kv = 5, `builtUp` |
| D8 | `cirsoc301.ts` flexure | noncompact V2: φMn 326 vs 286.1 kNm (+14 %, unsafe); top-flange LTB not modelled | stabileo: only §F.2; no load height; inelastic LTB uses AISC 360-10's 0.7Fy and Lr, not CIRSOC's FL = Fy − Fr (F.2-6a/F.2-7a) | **fixed**: F.3/F.4/F.5 by classification, F.2.4–F.2.7 in CIRSOC form, `loadPosition` (default top flange, the lower) |
| D9 | `steel_check` shear | φvVn = 275 vs 306 kips (−10 %, safe) | stabileo deliberate: G2.1(a)'s φv = 1.00 needs "rolled" and h/tw, not in the input | documented |
| D10 | `ec3_check` LTB | not comparable to the published examples | stabileo implements 6.3.2.2 (general, conservative) with zg = 0; examples use 6.3.2.3 with f and/or top-flange loading | documented; uncovered |
| D11 | `ec3_check` interaction | linear sum with k = 1 | stabileo simplification; unconservative where Annex B gives kyy > 1 | **fixed**: (6.61)/(6.62) with Annex B factors; Cm defaults to 1.0 (Table B.3 maximum) |
| D12 | JRC-EC2 p. 90 | printed `(100·0,02·16,7)^(1/3)` | example typo: fcd for fck; its 69 kN is the fck = 25 value | example wrong |
| D13 | INTI301 Ej. 3 | stabileo 1.1 % below | modelling convention: stabileo evaluates the weld line (y = 10.5 cm), the example the edge of its 1 cm strip (y = 11 cm) | neither wrong |
| D14 | INTI201 Ej. 3.I | min stirrups 157 vs 159 mm²/m | example rounding: "bw/1.26" for fyt/(0.33·1000) = 1.273; the clause and the example's own §3.4.4 give 157 | example rounding |
| D15 | INTI301 Ej. 2 | adopted 4 mm leg below its own Tabla J.2.4 minimum of 5 mm | example: the 2018 table has no "thinner part" exception; stabileo flags the minimum | example wrong |
| D16 | INTI301 Ej. 1 | bearing unavailable in stabileo | example uses the AISC 17.5 mm hole for a 5/8" bolt; the 2018 Tabla J.3.3 is metric only. Also: stabileo gives every bolt the end bolt's Lc (conservative) | example inconsistent with the 2018 text |
| D17 | INTI301 Ej. 10(c) | stabileo's Pd 1.1 % above the printed 204.7 kN when it derives the wall widths | the example takes b = 18 cm (plate width) for b/t and 18/17.75 cm in Aef; B.4.1(b)(c) defines b as the distance between welds, 17.5 cm. With the example's widths stabileo reproduces it | example inconsistent with B.4.1 |
