# Design checks against published worked examples

The certified enclosures ([CERTIFY.md](CERTIFY.md), `engine/src/certify/design.rs`) prove that a
design check's numbers are what its formulas give. They do not prove that the formulas are the
code clauses. This document records the second question: every implemented design check, clause
by clause, against a worked example someone else published, comparing the example's printed
intermediate values (λ, χ, Fcr, Lp, Lr, Mcr, Cv, Vc …) as well as its final resistance.

Tests:

- Rust checks: [`engine/tests/design_worked_examples.rs`](../../engine/tests/design_worked_examples.rs)
  (steel, concrete, connections) and
  [`engine/tests/design_worked_examples_2.rs`](../../engine/tests/design_worked_examples_2.rs)
  (cold-formed steel, timber, masonry, spread footings)
- TypeScript checks, next to their implementations:
  - [`web/src/lib/engine/codes/argentina/__tests__/cirsoc301-worked-examples.test.ts`](../../web/src/lib/engine/codes/argentina/__tests__/cirsoc301-worked-examples.test.ts)
  - [`web/src/lib/engine/codes/argentina/__tests__/cirsoc201-inti-examples.test.ts`](../../web/src/lib/engine/codes/argentina/__tests__/cirsoc201-inti-examples.test.ts)
  - [`web/src/lib/connection/__tests__/fillet-weld-inti.test.ts`](../../web/src/lib/connection/__tests__/fillet-weld-inti.test.ts)
  - [`web/src/lib/connection/__tests__/bolted-joint-inti.test.ts`](../../web/src/lib/connection/__tests__/bolted-joint-inti.test.ts)
  - [`web/src/lib/engine/detailing/__tests__/foundation-check-published.test.ts`](../../web/src/lib/engine/detailing/__tests__/foundation-check-published.test.ts)
  - [`web/src/lib/codes/cirsoc201/__tests__/crack-control-published.test.ts`](../../web/src/lib/codes/cirsoc201/__tests__/crack-control-published.test.ts)

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
| AISC-15 | AISC, *Companion to the AISC Steel Construction Manual, Vol. 1: Design Examples*, v15.1 (ANSI/AISC 360-16; E4-2 and E7 unchanged in 360-22). Free from aisc.org (retrieved via the Wayback Machine, aisc.org being behind a bot challenge). |
| AISI-M | AISI, *Cold-Formed Steel Design Manual*, 2008 edition (AISI S100-07). Scholars' Mine, Missouri S&T, `ccfss-aisi-spec/159`. Page numbers are the manual's (II-149, III-56). |
| WDF04 | J. Showalter, "Structural Wood Design Using ASD and LRFD", *Wood Design Focus*, Winter 2004, pp. 11–19 — Problem 10 of Wheat & Cramer's AF&PA design aid. AWC web-media `WDF-2004-UsingASDandLRFD-0512.pdf`. |
| AWC-E | AWC/ICC, *2015/2018 Structural Wood Design Examples* (sold, not free). E1.4 and E1.8 with the printed AWC values as reproduced in Tekla Tedds, "Verification Example – Axial Compression of Wood Column (ASD)" (2026), and Dlubal Knowledge Base 001714 (C. Tjoa, 2023). Secondary: the AWC book itself was not at hand. |
| LC19 | Lee & Chiew, "A review of Class 4 slender section properties calculation for thin-walled steel sections according to EC3", *Advanced Steel Construction* 15(3) (2019) 259–266. Example 1 (welded I in bending) divides I by the distance to the flange mid-plane and is not used. |
| ENER | ENERCALC, *SEL Verification Example Series – Wood Column Module*, 2026 V1, hand calculation pp. 1–5. Software-vendor verification document. |
| P751 | FEMA P-751, *2009 NEHRP Recommended Seismic Provisions: Design Examples* (2012), ch. 10 Masonry (TMS 402-08). |
| P1051 | FEMA P-1051, *2015 NEHRP Recommended Seismic Provisions: Design Examples* (2016), ch. 13 Masonry (TMS 402-13). |
| MCG20 | W. M. McGinley, "Design of Tall Masonry Walls – Session 2", Masonry Institute of Hawaii (March 2020), TMS 402-13. |
| SP-WIGHT | StructurePoint, "Reinforced Concrete Spread Footing (Isolated Footing) Analysis and Design", ACI 318-14 (Sep. 2018), after Wight, *Reinforced Concrete Mechanics and Design* 7th ed., Ex. 15-2. |
| ACI-F1 | ACI, "Footings Example 1 — Design of a square spread footing of a seven-story building" (ACI 318-14), concrete.org `318-example-1_rf_r1.pdf`. |
| INTI-B | Same book as INTI201, chapter "Bases de Hormigón Armado", Ejemplo 7.I (pp. 122–124); copy at rdu.unc.edu.ar `11086/1161`. |
| RFEM | Dlubal Knowledge Base 002041 (ACI 318-19 / ASD single footing). Software verification article. |
| SP-WALL, SP-SLAB | StructurePoint, "Reinforced Concrete Cantilever Retaining Wall (ACI 318-19)" (spWall v10.50, 2026), p. 14; "One-Way Slab (ACI 318-14)" (spBeam v10.00), p. 14. |

## Inventory of design checks

| Check | Code | Where | Clauses implemented |
|---|---|---|---|
| `steel_check` | AISC 360-16/22 LRFD | Rust | D2 tension (yield, rupture with An·U), E3 flexural buckling, E4-2 torsional buckling of doubly symmetric members (new, `lcz`), F2 yielding + LTB (Lp, Lr, F2-2/F2-4, Cb input), F3 / F6.2 flange local buckling (new, optional `flangeSlenderness`), F6 minor axis, G2.1 shear (φv = 0.90, Cv1 input), H1-1 interaction |
| `ec3_check` | EN 1993-1-1 | Rust | Class-dependent W/A (6.2), 6.2.3 / 6.2.4 axial, 6.2.5 bending, 6.2.6 shear (Av input), 6.3.1 flexural buckling (curves a–d), 6.3.2.2 LTB general case with Mcr(C1, zg = 0), 6.3.3 interaction (6.61)/(6.62) with Annex B factors (Cm input, default 1.0) |
| `ec2_check` | EN 1992-1-1 | Rust | 3.1.7 rectangular block flexure by strain compatibility (εcu3 from Table 3.1, top bars at their own strain), 6.2.2 VRd,c with k1·σcp, 6.2.3 VRd,s and VRd,max (cot θ 1–2.5) |
| `rc_check` | ACI 318-19 | Rust | 22.2 Whitney block flexure (rectangular, doubly, T-beam), P–M point at Nu by strain compatibility, 21.2.2 φ, 22.5.5.1 Vc table with λs, Vs ≤ 0.66√f'c·bw·d |
| `cirsoc201_check` | CIRSOC 201-2005 | Rust | Flexure (Whitney, doubly), 9.3.2 φ, 11.3.1.1 Vc, 11.5.7.9 Vs cap |
| `connection_check` | AISC 360 (elastic method) | Rust | Bolt group elastic method with φRn input; fillet weld group elastic method, Fnw = 0.60·FEXX, J2.2b(d) end-loaded β |
| `cfs_check` | AISI S100 | Rust | E2 global buckling (flexural about y, flexural-torsional / torsional from `xo`, new), Pn = Ae·Fn, E4 distortional; F2 LTB with Se, F4 distortional; G2.1 shear; D2 yielding; linear interaction |
| `timber_check` | NDS (ASD, sawn lumber) | Rust | 3.3 bending with CL (Table 3.3.3 envelope, or `le_bending`), 3.4 shear, 3.7 CP (one le, or `le_b` across b), 3.8 tension, 3.9.1/3.9.2 combined |
| `masonry_check` | TMS 402 strength design | Rust | Axial Eq. 9-19/9-20 (steel only when `laterally_tied`), flexure Whitney 0.80f'm, shear Vnm + Vns with cap and γg, linear interaction |
| `foundation_check` | Bearing + ACI 318-19 | Rust | Meyerhof effective-area bearing, overturning, sliding, one-way shear Table 22.5.5.1(c), punching 22.6.5.2, λs (or 1 per §13.2.6.2 with `neglect_size_effect`) |
| `foundation-check.ts` | CIRSOC 201-2025 | TS | Linear (P/A ± M/S) bearing with kern refusal, one-way shear, punching through `punching-shear.ts`, flexure at the column face |
| `serviceability` | — | Rust | Deflection against L/ratio or an absolute limit, frequency against a minimum: comparisons only (no effective inertia, no crack width) |
| `crack-control.ts` | CIRSOC 201-2025 §24.3.2 | TS | Maximum bar spacing for crack control |
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
| E7.1(a) slender web, built-up I | AISC-15 E.2 (pp. E-15 – E-18) | kc = 0.516, he = 12.6 in, Ae = 19.2 in², Pn = 555, φcPn = 500 kips | pass |
| E7.1 slender but unreduced (λ < λr√(Fy/Fcr)) | AISC-15 E.3 (pp. E-19 – E-23) | kc = 0.743, Ae = Ag = 9.69 in², Pn = 353, φcPn = 318 kips | pass |
| E7.1(b) rectangular HSS, both walls | AISC-15 E.10 and Table E.10 (pp. E-56 – E-60) | Lc = 18 / 24 / 40 ft: Ae = 5.35 / 5.77 / 6.76 in², Pn = 197 / 168 / 82.5, φcPn = 177 / 151 / 74.2 kips | pass (replaces the hand-worked HSS case, which stays as a clause test) |
| E7.1(a) rolled W, strong axis | AISC-15 I.13 (pp. I-127 – I-131) | he = 16.8 in, Ae = 13.9 in², Pnx = 506, φcPn = 455 kips | pass (with `lcz = 0`) |
| E7.2 round HSS | — (clause by hand, D/t = 100) | E7-7 factor 0.9290 | clause test; no free published example with D/t > 0.11E/Fy found |
| E4-2 torsional buckling, doubly symmetric | AISC-15 E.2, E.3 | Fe = 91.9 ksi (Cw = 5,470 in⁶, J = 5.41 in⁴), Fe = 71.2 ksi (Cw = 1,050, J = 0.407) | **fixed** (D19) |
| E4 constrained-axis torsional buckling (Commentary C-E4-1) | AISC-15 I.13 | Fez = 6.20 ksi, Pnz = 80.0, φcPn = 72.0 kips | **open** (D20) |
| F2 load height (Cb·1.4^(2y/h), Helwig et al. 1997) | — | top flange: φMn(F2-3) ÷ 1.4 | clause test; default top flange |
| E4-3/E4-4 flexural-torsional (singly symmetric, unsymmetric), F4/F5, G2.2 tension field, H1.2 Cb for tension | — | not implemented | uncovered (not implemented) |

### EN 1993-1-1 (`ec3_check`, Rust)

| Clause | Example | Printed values compared | Status |
|---|---|---|---|
| 6.2.5 Mc,Rd (Class 1) | SBE A.1 (pp. 4-57–4-62), SBE A.2 (pp. 4-64–4-69) | Mc,Rd = 189.01 / 307.15 kNm; ratios 0.479 / 0.798 | **fixed** (D4: Lb = 0 was NaN) |
| 6.2.6 Vpl,Rd | SBE A.1, A.2 | Vpl,Rd = 417.9 / 579.21 kN | pass |
| 6.2.4 / 6.2.3 A·fy/γM0 | P364 Ex. 9 | Nc,Rd = 5658 kN | pass |
| 6.3.1 χ, Ncr, Nb,Rd | SBE A.5 (pp. 4-94–4-97) | χy = 0.808, χz = 0.671, Nb,Rd = 2349.5 kN, ratio 0.85 | pass |
| 6.3.1, Class 3 | P364 Ex. 9 (sheets 1–6) | χz = 0.65, Nb,z,Rd = 3678 kN, Blue Book Nb,y,Rd = 5010 kN | pass |
| 6.3.2 Mcr with load height (SN003b eq. 2) | SBE A.1 (pp. 4-60–4-61) | zg = +165 mm, C1 = 1.127, C2 = 0.454: Mcr = 113.9 kNm, λ̄LT = 1.288 | pass (zg added; default top flange) |
| 6.3.2 χLT | SBE A.1; P364 Ex. 3, 4, 5, 12 | — | uncovered: the examples use 6.3.2.3 with f, or take Mcr from LTBeam without printing It/Iw; stabileo implements 6.3.2.2 (D10) |
| Class 4: EN 1993-1-5 4.3/4.4 Aeff, Weff,y, Weff,z; 6.2.9.3 with eN·NEd | — (clause by hand: welded I 600×300×12×6 and 400×300×8×8, RHS 400×200×6, S355) | ρ = 0.949 / 0.430, Aeff = 8330 mm², Weff,y = 2302.3e3, Weff,z = 164.2e3 mm³, RHS Aeff = 5268 mm² | clause test; no free published example found. Gross A/Wel used to stand in (unsafe); now refused without Aeff/Weff/eN or geometry, CHS refused (EN 1993-1-6) |
| Class 4 Aeff, welded box in compression | LC19 Example 2 (Box 4) | λ̄p = 2.12, ρ = 0.423, Aeff = 16980 mm² | pass (box entered with h = c + 3t: welded flat width h − 2t) |
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
| D.2(b)/D.3 Ae = An·U, B.4.2.2 An (+2 mm, s²/4g) | — (clause by hand: IPE 200 bolted through the flanges, x̄ = 25, L = 150 mm; edge-welded plate) | An = 2340 mm², U = 0.833, φPn = 526.5 kN | clause test; refused without the connection (was Ae = Ag) |
| D.3 from the model's end connection (`tension-connection.ts`): x̄, U, An | AISC Design Examples D.1 (W8x21 flanges, x̄ 0.831 in), D.2 (L4x4x1/2 one leg, x̄ 1.18 in, U 0.869), D.3 (WT6x20 flange welded, x̄ 1.09 in, U 0.932); clause by hand: L 100×10 one leg 4 × M20 @ 70, IPE 200 flanges/web, 2 × L 50×5 back to back, UPN web, 300 × 12 plate staggered, edge-welded bar | x̄ within 1 % above AISC's (sharp corners); U = 0,9 where CIRSOC's cap binds (D.1, D.3); L100: An 1680, U 0.8634, Ae 1450.5 mm² | clause test; tubes/cold-formed/drawn refused |
| D.2/D.3 from the connection geometry: B.4.2.2 holes (+2 mm), U = 1 − x̄/L ≤ 0,9 (Rust `cirsoc301_check`) | INTI301 Ej. 4 (Ej. 4-1 – 4-3), IPB 120 tie | An = 26,08 cm², U = 0,93 → 0,9, φRn yield 719 kN, rupture 651 kN | pass |
| E.4 torsional / flexural-torsional (E.4.2, E.4.4, E.4.5) | — (clause by hand: tee 200×150×12×10, L = 3 m; IPE 300 with ky = 0.5) | Fcr = 125.6 MPa, φPn = 392.8 kN (flexural alone 451.8) | clause test; no INTI tee/channel column example at hand |
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

### AISI S100 (`cfs_check`, Rust) — units kip, in, ksi; S100-07 examples, same equations as S100-16 for every clause compared

| Clause | Example | Printed values compared | Status |
|---|---|---|---|
| E2 / C4.1.2 flexural-torsional buckling | AISI-M III-3, 362S162-54 (pp. III-55 – III-57) | Fe = 18.5 ksi (β = 0.598, σex = 42.0, σt = 24.4), Fn = 16.3 ksi, Pn = 6.88 kips; Fe about y = 29.6 ksi | **fixed** (D18) |
| E4 / C4.2 distortional compression | AISI-M III-3 (pp. III-59, III-61) | Fd = 22.2 → Pn = 11.0 kips; Fd = 66.5 → Pn = 17.6 kips | pass |
| F2 / C3.1.2.1 inelastic LTB | AISI-M II-3, 550T125-54 (pp. II-148 – II-150) | Fe = 58.6 ksi, Fc = 30.93 ksi, Mn = Sc·Fc = 18.7 kip-in (Sc at Fc passed as `se_x`) | pass |
| F2 elastic LTB | AISI-M III-9, back-to-back 9CS2.5x059 (pp. III-81 – III-84) | Fe = Fc = 29.3 ksi < 0.56Fy, Mn = 134 kip-in | pass |
| F4 / C3.1.4 distortional flexure | AISI-M II-4, 800S200-54 (pp. II-152 – II-158) | Fd = 26.1 → Mn = 49.8; Fd = 56.4 → Mn = 66.7 kip-in | pass |
| G2.1 inelastic shear | AISI-M II-3 | h/t = 95.7, Fv = 14.3 ksi, Vn = 4.38 kips | pass |
| G2.1 elastic shear | AISI-M II-1 (pp. II-129 – II-130) | h/t = 121, 144: Fv = 9.69, 6.85 ksi; Vn = 5.76, 3.44 kips | pass |
| Ae at Fn | — | the manual evaluates Ae (and Sc) at Fn; the checker takes the caller's Ae/Se, documented "at Fy" (conservative); the tests pass the example's | doc |

The manual uses G = 11,300 ksi; the checker E/2.6 = 11,346 ksi (moves no printed digit). III-2's
printed λc = 0.851 should be 0.881 (D26), so its Fn/Pn are not used.

### NDS (`timber_check`, Rust) — ASD, units lbf, in, psi

| Clause | Example | Printed values compared | Status |
|---|---|---|---|
| 3.7.1 CP, one le about both axes | AWC-E E1.4, 4x4 and 6x6 Southern Pine No. 2, 10 ft | FcE = 357 / 760 psi, CP = 0.232 / 0.801, Fc' = 336 / 421 psi, P = 4,120 / 12,725 lbs | pass (dressed sizes 3.5 / 5.5 in derived; they reproduce FcE) |
| 3.7.1, 3.3.3 CL, Fb' | AWC-E E1.8, 2x4 truss member, CD = 1.6 | FcE1 = 3,963, FcE2 = 728 psi, CP = 0.29, Fc' = 673 psi; RB = 9.65, CL = 0.982, Fbx' = 1,729 psi | pass with `le_bending` = 1.37·lu + 3d (D24); the printed biaxial 3.9-3 (0.98) is outside the strong-axis checker |
| 3.3.3 CL, 3.4 shear | WDF04 Problem 10, 5 × 9-5/8 glulam, CD = 1.15 | le = 498.3 in, CL = 0.956, F'b = 2198, fb = 1769, F'v = 345, fv = 83.1 psi | pass with `le_bending` (D24) |
| 3.7.1 with weak axis braced, 3.3.3 CL, 3.4, 3.9.2 (Eq. 3.9-3) | ENER 2x6 DF-L No. 2 stud, 12 ft | CP = 0.411, F'c = 610.33 psi, fc/F'c = 0.159; CL = 0.477, F'bx = 1027.67 psi, fb/F'b = 0.667, F'v = 288 psi; Cp = 0.272, F'c = 647.07 psi, (3.9-3) = 0.702 | pass with `le_b = 0` (new) |
| 3.9.1 tension + bending | — | U. Michigan ARCH 544 notes print only the factors; the interaction value is handwritten | uncovered |

### TMS 402 (`masonry_check`, Rust)

| Clause | Example | Printed values compared | Status |
|---|---|---|---|
| Eq. 9-20 slender axial, untied bars | MCG20 slide 38 (TMS 402-13) | h/r = 114.5, R = 0.373, φPn = 39,265 lb/ft | **fixed** (D21) |
| Eq. 9-19 (h/r ≤ 99) | — | no free published example found | uncovered |
| Flexure, Whitney block 0.80f'm | P751 Table 10.1-2 (p. 10-19) | C = 18.76 / 19.84 klf, Mn = 62.3 / 65.35 in-kip/ft | pass with As,eq = As + Pu/fy (D28) |
| Shear Vnm + Vns, cap (6.67 − 2.67 M/Vd) | P751 Table 10.2-3 (p. 10-56), TMS 402-08 | five stories, Vn = 264 / 261 / 257 / 248 / 218 kips (cap in the last two) | pass (D23 at the cap) |
| Shear with γg (Eq. 9-21) | P1051 Table 13.2-3 (p. 13-60), TMS 402-13 | Vn = 198 / 196 / 193 / 186 / 164 kips, γg = 0.75 | **fixed** (D22) |

### Spread footings (`foundation_check`, Rust; `foundation-check.ts`, TS)

| Clause | Example | Printed values compared | Status |
|---|---|---|---|
| Punching Vu and φVc (22.6.5.2) | SP-WIGHT (pp. 5–6) | Vu = 805 kips, φvc = 164 psi (b0 = 4·46 in, d = 28 in) | pass with λs = 1 (D24, D25) |
| One-way demand at d | SP-WIGHT (p. 7) | Vu = 204 kips | pass (318-14 φVc = 308 kips is a superseded formula) |
| Punching and one-way | ACI-F1 (pp. 4–6) | Vu = 851, φVc = 958 kips; one-way Vu = 231 kips | pass at 1 % (the example carries qu rounded to 6.7 ksf) |
| Punching (CIRSOC 201-2005 11.12.2.1) | INTI-B 7.I | Vu = 1225 kN, φVc = 2067 kN | pass (D25: 1/3 vs 0.33) |
| TS: qu, column-face moment, punching demand | INTI-B 7.I; SP-WIGHT; ACI-F1 | Muy = 311.11, Mux = 295.75 kNm, Vu = 1225 kN; Mu = 954 kip-ft, Vu = 805 kips; Mu = 1005 kip-ft, Vu = 231 / 851 kips | pass |
| TS: linear bearing P/A ± M/S | RFEM 002041 | q = 2.565 ± 0.394, qmax = 2.959, qmin = 2.172 ksf, 0.993 | pass |
| One-way φVc, Table 22.5.5.1(c), and λs | — | no hand-worked ACI 318-19 footing printing λs found (RFEM's prints λs = 1, as §13.2.6.2 allows) | uncovered |
| Overturning, sliding, Meyerhof effective area | — | — | uncovered |

### Serviceability

| Clause | Example | Printed values compared | Status |
|---|---|---|---|
| §24.3.2 crack-control spacing (`crack-control.ts`) | SP-WALL (ACI 318-19), SP-SLAB (ACI 318-14) | s = 10 in (cc = 2.00 in, governs); 13.13 in capped at 12 in (cc = 0.75 in) | pass (D30: SI soft conversion, 2 %) |
| Deflection / frequency limits (`serviceability.rs`) | — | the check compares a given deflection or frequency with a limit; there is no effective-inertia (ACI 435, EC2 7.4) or crack-width (EC2 7.3.4) computation to compare with a published example | not applicable |

### Not covered

The CIRSOC 201-2025 detailing modules (`codes/cirsoc201/*`) other than crack control have no
published worked example: their rules are geometric limits rather than resistances, and they
remain covered by `web/src/lib/codes/cirsoc201/__tests__/`. Also not reproduced: the ECCS
*Design of Plated Structures* welded box with unequal flanges (via SOFiSTiK DCE-EN30) — the
checker's effective section covers doubly symmetric I and RHS only; Weff of a Class 4 web in
bending (LC19 Example 1 uses a non-standard lever arm). Not found freely: a CIRSOC 301 flexural-torsional (E.4) or staggered-hole (s²/4g)
example; an AISC E7.2 slender round HSS; CFSEI technical notes and the current AISI D100 manual
(sold); the AWC examples book (sold); NCMA TEK notes (login).

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
| D18 | `cfs_check` compression | AISI-M III-3: Pn = 10.4 vs 6.88 kips (+51 %, unsafe) | stabileo: weak-axis flexural buckling only; flexural-torsional buckling (E2.2) of a channel not evaluated | **fixed**: `xo`, `kx_lx`, `kt_lt`; E2.2 in cancellation-free form, same function for the certified enclosure; without `xo` a compression demand is unevaluated (and refused by the certified path) |
| D19 | `steel_check` compression | no E4: a member braced about y more closely than it can twist kept the E3 strength | stabileo | **fixed**: E4-2 for doubly symmetric members, Lcz = `lcz` or the longer flexural length; refused when Lcz exceeds the weak-axis length and neither J nor Cw is given. AISC-15 E.2/E.3 torsional Fe reproduced |
| D20 | `steel_check` compression | AISC-15 I.13: girt-braced W21×50 governed by constrained-axis torsional buckling, φcPn = 72.0 kips; stabileo (E4-2 at Lcz = 45 ft: Fez = 15.1 ksi) φcPn ≈ 175 kips | stabileo: constrained-axis torsion (bracing on one flange, Commentary C-E4-1) not implemented | **open**: `lbz = 0` must only be used when both flanges are braced |
| D21 | `masonry_check` axial | MCG20: φPn 14 % above the printed 39,265 lb/ft | stabileo: fy·As counted for untied bars, which TMS 402 neglects | **fixed**: steel term only with `laterally_tied` |
| D22 | `masonry_check` shear | P1051: Vn 33 % above the printed values for a partially grouted wall | stabileo: no γg (TMS 402-13 Eq. 9-21; 402-22: 0.70) | **fixed**: `gamma_g`; default 0.70 when An < b·t, else 1.0 |
| D23 | `masonry_check` shear cap | up to 0.6 % below P751 where the cap governs | SI coefficients 0.50 and 0.33 are 6 and 4 √psi rounded down (0.4982, 0.3321) | documented (conservative) |
| D24 | `timber_check` CL; `foundation_check` λs | CL from the Table 3.3.3 footnote envelope (WDF04: 0.951 vs 0.956); footing shear always reduced by λs (ACI 318-19 §13.2.6.2 permits λs = 1) | stabileo deliberate: the loading condition is unknown, the envelope is the longest le; λs is the lower strength | documented; `le_bending` and `neglect_size_effect` opt in to the example's |
| D25 | `foundation_check` punching | 0.6 % (ACI, 4 √psi) and 1.0 % (CIRSOC 201-2005, 1/3) below the printed φVc | SI coefficient 0.33 | documented (conservative) |
| D26 | AISI-M III-2 | printed λc = 0.851 | example arithmetic: √(33/42.52) = 0.881; its Fn and Pn are slightly high | example wrong (not used) |
| D27 | P751 Table 10.2-3 | Vns printed 68.3 kips | example arithmetic: 0.5·0.07·60·32.67 = 68.6 | example rounding |
| D28 | `masonry_check` flexure | P751 adds Pu to the steel force (Mn = (As·fy + Pu)(d − a/2)) | stabileo takes Mn at Pu = 0 and the axial load through the linear interaction (conservative below the balance point) | documented; the clause is reproduced with As,eq = As + Pu/fy |
| D29 | `timber_check` glulam | no volume factor CV (NDS 5.3.6: the lesser of CL and CV) | stabileo models sawn lumber; c = 0.8 in CP is conservative for glulam (0.9) | documented: pass CV as `cf_bending` (the product CL·CV, conservative) |
| D30 | `crack-control.ts` | 1.5–1.9 % more permissive than the inch-pound examples | the code's SI Table 24.3.2 is a soft conversion (380 mm ≈ 15 in, 280 MPa ≈ 40 ksi) | documented (the SI table is the enacted text) |
| D31 | SP-WIGHT beam companion (spBeam simply supported beam) | printed smax = 10.31 in for cc = 1.5 in | example: 15 − 2.5·1.5 = 11.25; 10.31 is cc = 1.875 in (cover plus the #3 stirrup) | example inconsistent (not used) |
