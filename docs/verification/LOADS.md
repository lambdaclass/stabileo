# Loads and combinations: clause-by-clause verification

Stabileo generates loads and load combinations from the Argentine regulations. A wrong load is
as dangerous as a wrong solver, so every clause, table and formula the generators apply was
checked against three kinds of reference:

1. **The official text.** Each data table was transcribed a second time, independently, from
   the converted regulations in `docs/codes/CIRSOC/markdown/` (see `docs/codes/CIRSOC/SOURCES.md`
   for the PDFs and their SHA-256). The transcription is a parser or a hand transcription
   inside the test, never a copy of the module. Every row is diffed programmatically.
2. **Published worked examples.** These include INTI-CIRSOC guides, the regulations' own
   commentary examples and practitioners' guides. Each test names the document, the example
   and the page. Published intermediate values are matched to the published rounding. Where no
   published example exists, the clause is marked so and is checked only against its formula
   and table. **No number in these tests was made up.**
3. **Properties and edges.** These cover continuity at the corners of the spectrum, table row
   boundaries, interpolation, and every subset of loads present for the combinations.

Editions: CIRSOC 101-2025, CIRSOC 102-2025, INPRES-CIRSOC 103-2018 Parte I and CIRSOC
104-2005. These are the texts supplied and in force (`SOURCES.md`).

Status: **verified** means it agrees with the reference. **Fixed** means it disagreed,
stabileo was wrong, and it is corrected with a regression test. **Formula only** means it
agrees with the official formula or table, with no published example found. **Uncovered**
means there is no test against an independent reference.

## Discrepancies found (all unsafe, all fixed)

| # | Clause | What was wrong | Effect | Test |
|---|---|---|---|---|
| 1 | CIRSOC 101-2025 §2.3.2, "se deberán investigar los efectos de una o más cargas que no estén actuando" | Only the printed combinations were generated. With no floor live load and wind present, combination 3 existed only as 1,2 D + 1,6 Lr + 0,5 W. | Roof suction lowered every gravity combination. In `pro-simple-shed` the column axial force went from 44 to 62 kN and the rafter moment from 6.9 to 11.4 kN·m. | `cirsoc101/__tests__/verification-combinations.test.ts` |
| 2 | INPRES-CIRSOC 103-2018 §3.7.1 [3.16], Tabla 3.3 | The seismic combination took CIRSOC 101's 0,2 S. [3.16] asks for f2 = 0,70 on roofs that are horizontal or keep their snow, and f1 for L. | Seismic combination too light where snow stays on the roof. | `verification-combinations.test.ts`, `engine/loads/__tests__/seismic-snow.test.ts` |
| 3 | INPRES-CIRSOC 103-2018 §3.6 [3.15] | The level weights had no f2·S term. | Seismic weight and base shear too low with snow. | `seismic-snow.test.ts` |
| 4 | INPRES-CIRSOC 103-2018 Tabla 2.5 | Group Ao declared with medium irregularity was given the static method. Ao admits only line 1a of Tablas 2.3 and 2.4. | Static method where the dynamic one is required. | `cirsoc103/__tests__/verification-edges.test.ts` |
| 5 | CIRSOC 102-2025 Fig. 2.4-1 notes 2 and 3 | Roof Cp for θ ≥ 10° rounded h/L up to the next printed row instead of interpolating. | Positive windward Cp too low: 0,2 instead of 0,296 at 25°, h/L 0,26. | `cirsoc102/__tests__/verification-tables.test.ts` |
| 6 | CIRSOC 102-2025 Fig. 2.4-1 note 2 | Past the first row's "0,0*", it was interpolated toward the second row's positive values. Note 2 prescribes 0,0. | Net roof uplift too small: 0,3 instead of 0,0 at 52,5°, h/L 0,5. | `verification-tables.test.ts` |
| 7 | CIRSOC 101-2025 §4.7.2 (by width) | In width mode every member was reduced with the largest tributary area in the model. | An edge beam with KLL·AT = 36 m² < 37 m², which §4.7.2 does not reduce, came out 21 % light. | `engine/loads/__tests__/load-plan.test.ts` |
| 8 | CIRSOC 101-2025 §4.7.6 | One-way slabs were reduced, following ASCE 7 and the commentary. The 2025 rule reads "no se podrán reducir excepto en el caso de sobrecargas pesadas". | Live load too low on one-way slabs (no current caller passes them). | `cirsoc101/__tests__/verification-loads-tables.test.ts` |
| 9 | CIRSOC 101-2025 §4.3.2 | A partition allowance below 0,75 kN/m² counted as the allowance; the default dead-load build-up itself carried 0,55 kN/m² (Tabla 3.1 double gypsum). Now warned, and the default uses a §4.3.2 row of 0,75 kN/m² of floor. | Partition load too low. | `verification-loads-tables.test.ts` |
| 10 | CIRSOC 104-2005 Tablas 1.8 and 1.13 | Uspallata (0,80 kN/m²) and Villa Reynolds (0,45 kN/m²) are printed above the table headers and were missing. | They could only be read as their departments' 0,3 kN/m², 2.7 and 1.5 times too low. | `cirsoc104/__tests__/verification-tables.test.ts` |

Errors found in the references, where stabileo follows the code:

- CIRSOC 102-2025 commentary Tabla C 1.9-1 prints N₁ = 1,053. Its own printed L_z̄ and V̄ give
  1,059. Its other values are computed from the unrounded imperial inputs of the ASCE example it
  translates, and stabileo reproduces all of them with those inputs.
- The INTI-CIRSOC 102 guide, Example 3, takes G with B = 30 m for both wind directions as a
  conservative shortcut. §1.9.4 defines B across the wind.
- CIRSOC 101-2025 commentary Tabla C 4.8.3 prints 0,341 at 4 % slope, where the formula gives
  0,3402. Its angle is also wrong.
- CIRSOC 104 Comentarios, Example 3, leaves out the rain-on-snow surcharge "ya que pg es igual a
  1,0". Cap. 10 prints "pg ≤ 1", so stabileo applies it, which is the heavier reading. The same
  example reads hd off Figura 9 by eye: 0,91 and 1,21 m against stabileo's 0,932 and 1,187.
  An independent re-digitization of the figure's vector paths agrees with stabileo.
- The same guide's Example 5 has two C&C wall pressures, +694 and −757 N/m², below the 2025
  minimum of 0,80 kN/m² (§5.2.2). This is an edition change, and stabileo applies the minimum.

## Coverage

Paths are under `web/src/lib/`. Test files: **C** = `codes/cirsoc101/__tests__/verification-combinations.test.ts`,
**L1** = `codes/cirsoc101/__tests__/verification-loads-tables.test.ts`,
**L2** = `codes/cirsoc101/__tests__/verification-loads-published.test.ts`,
**W1** = `codes/cirsoc102/__tests__/verification-tables.test.ts`,
**W2** = `codes/cirsoc102/__tests__/verification-examples.test.ts`,
**S1** = `codes/cirsoc103/__tests__/verification-tables.test.ts`,
**S2** = `codes/cirsoc103/__tests__/verification-edges.test.ts`,
**S3** = `codes/cirsoc103/__tests__/verification-published.test.ts`,
**N1** = `codes/cirsoc104/__tests__/verification-tables.test.ts`,
**N2** = `codes/cirsoc104/__tests__/verification-examples.test.ts`,
**P** = `engine/loads/__tests__/seismic-snow.test.ts` and `load-plan.test.ts`.

### Combinations

| Clause | Source | Test | Status |
|---|---|---|---|
| CIRSOC 101-2025 §2.3.2, the seven combinations | Official text p. 51, parsed from the normative column | C | Verified: soundness over all 64 subsets of L, Lr, S, R, W, E, at Lo above and below 5 kN/m² |
| §2.3.2, "cargas que no estén actuando" | Official text; property: every printed combination, with any subset of its variable loads not acting, lies inside the generated envelope, sign by sign, for 400 random effect vectors per subset | C | **Fixed** (#1) |
| §2.3.2, W and E never together | Official text; 103 §3.7.4 | C | Verified |
| §2.3.2 Exception 1 (0,5 L in 3, 4, 5; Lo ≤ 5; garages and public assembly; boundary at exactly 5) | Official text | C, `cirsoc101.test.ts` | Verified. The largest Lo of the structure governs, which is conservative |
| §2.3.2 Exception 2 (companion S) | Official text and its commentary: the balanced load of a flat (pf) or sloped (ps) roof | `cirsoc101.test.ts` | Verified; the note's wording was corrected |
| §2.3.2 F with D's factor in 1–5 and 7 | Official text | C | Verified |
| §2.3.2 H at 1,6 / 0,9 / 0, both cases when unstated | Official text | C | Verified |
| §2.3.4 T | Official text (factor ≥ 1,0); the commentary's two combinations | `cirsoc101.test.ts` | Formula only |
| CIRSOC 102-2025 B.3.2 (1–3) = 101's 3, 4, 6 | Official text p. 242, parsed | C | Verified |
| CIRSOC 102-2025 B.4.2 service (D + Wa; D + 0,5 L + Wa; 0,6 D + 0,6 W; D + 0,75 L + 0,45 W + 0,75 (Lr ó S ó R)) | Official text p. 244, parsed | C | Verified, factor for factor |
| INPRES-CIRSOC 103-2018 §3.7.1 [3.16]/[3.17], Tabla 3.3 f1, f2 | Official text p. 53 | C, P | **Fixed** (#2): max(101, 103) per companion |
| 103 [3.10]/[3.18] E = EH ± EV, EV = (Ca/2)·γr·D | Official text | S2 | Verified |
| Both senses of W and E | `combination-cases.test.ts` | — | Verified (existing) |
| CIRSOC 101-2025 §2.3.3 (ice) | — | — | **Uncovered: not implemented.** No generator rule names Di or Wi, and ice cases enter only a project's own rules |
| CIRSOC 101-2025 §2.4 (extraordinary events, 2.4.1/2.4.2) | — | — | **Uncovered: not implemented.** It applies when the owner or code requires it, and A cases enter only a project's own rules |
| 103 [3.19]/[3.20] (steel, Ω0) | — | — | Uncovered: left to the steel design modules |
| Notional loads (`notional-combinations.ts`) | CIRSOC 301 direct analysis, out of the loads scope | — | Not reviewed here |

### CIRSOC 101-2025, dead and live loads

| Clause | Source | Test | Status |
|---|---|---|---|
| Tabla 3.1, 62 rows (value, column, (*) batten flag and its 0,1 kN/m² deduction) | Official text, each row found by its own label | L1 | Verified |
| §3.1.4 / §4.3.2 partitions (0,75 kN/m² minimum; exemption above Lo 4) | Official text | L1 | **Fixed** (#9) |
| Tabla 4.1, 53 numeric rows (Lo and concentrated loads), note (a), note (**) | Official text | L1 | Verified; the 9 and 14 kN manufacturing concentrated loads were added (not consumed yet) |
| Tabla 4.2 KLL, 7 rows | Official text | L1 | Verified |
| §4.7.2 Eq. (4.1): 37 m² threshold, 0,5 / 0,4 Lo floors | ENERCALC "SEL Verification Example Series – Live Load Reduction" (2026 V1), Problem 2, p. 2 (L/Lo 0,5641); Alderliesten, TU Delft Open, §2.5, Example 2.7 (0,50). Both are ASCE 7, the same formula in SI | L1, L2 | Verified |
| §4.7.2 tributary area by width | Clause | P | **Fixed** (#7) |
| §4.7.3 heavy, §4.7.4 garages, §4.7.5 assembly | Official text, edges | L1 | Verified |
| §4.7.6 one-way slabs | Official text | L1 | **Fixed** (#8) |
| §4.8.1 Lr = Lo R1 R2, heavy and light roofs, bounds, 0,5 kN/m² threshold | Commentary Tablas C 4.8.1–C 4.8.3 (pp. 95, 100), 34 rows parsed; ENERCALC Problem 1 (R1 0,63, R2 0,95) | L1, L2 | Verified |
| §4.3.3 pattern loading, §4.4 concentrated loads, curved roofs (§4.8.1), Tabla 3.2, Cap. 5 rain, §4.5, §4.6, §4.9, §4.12, §4.13 | — | — | **Uncovered** (not verified, or not implemented) |
| Tabla 4.1 rows not in the catalogue (gyms, heliports, restaurants, temples, …) | — | — | Not carried by the module |

### CIRSOC 102-2025, wind

| Clause | Source | Test | Status |
|---|---|---|---|
| Tabla 1.9-1 exposure constants | Official table, parsed | W1 | Verified |
| §1.13.1, Tabla 1.13-1 Kz (20 rows × 3 exposures; z < 5 m, zg, above zg, interpolation) | Official table, parsed | W1 | Verified (formula vs table ≤ 0,005) |
| §1.12 Tabla 1.12-1 Ke | Official table | W1 | Verified. The formula the module uses is above the table at 1200–1800 m, which is safe |
| Tabla 1.6-1 Kd | Official table | W1 | Verified |
| Tabla 1.11-1 (GCpi), enclosure criteria at their boundaries | Official table | W1 | Verified |
| Eq. 1.13-1 qz, Eq. 2.4-1 p = qGCp − qi(GCpi) | INTI-CIRSOC "Guía para el uso del Reglamento CIRSOC 102" (2005), Cap. 3, Examples 1 (pp. 22–27), 3 (pp. 32–37), 5 (pp. 46–51), 7 (pp. 53–58), with the printed q | W2 | Verified |
| Fig. 2.4-1 walls, leeward L/B interpolation | Official table; guide Examples 1, 3, 5, 7 | W1, W2 | Verified |
| Fig. 2.4-1 roof θ ≥ 10° | Hand transcription checked against the printed rows; guide Examples 5, 7, 9 | W1, W2 | **Fixed** (#5, #6) |
| Fig. 2.4-1 roof θ < 10° and along the ridge | Official table; guide Examples 1, 3, 9 | W1, W2 | Verified (−1,3 without the area reduction, conservative) |
| §1.9.4 G, Eq. 1.9-6 to 1.9-9 | Commentary Tabla C 1.9-1 (p. 67); guide Example 3 | W2 | Verified |
| §1.9.5 Gf, Eq. 1.9-10 to 1.9-16 | Commentary Tabla C 1.9-1 | W2 | Verified (one internally inconsistent N₁ in the example) |
| §2.1.5 minimum, enclosed buildings (0,75 / 0,4 kN/m²) | Official text | `wind.test.ts` | Verified |
| Figuras 2.4-4 to 2.4-7 free roofs | Official tables, parsed | W1 | Formula only |
| Figura 4.4-1 solid signs; 4.5-1 chimneys; 4.5-2 open signs; 4.5-3 towers; §4.8 minimum 0,8 kN/m² | Official tables, parsed | W1 | Formula only |
| §5.2.2 minimum 0,80 kN/m², Fig. 5.3-1 note 5 | Official text; guide Example 1 C&C walls | W1, W2 | Verified |
| Tablas C 5.3-1 to C 5.3-8 C&C curves, slope boundaries | Commentary equations, parsed | W1 | Formula only |
| Figura C AB.4.2-1 service wind factors | Official table | W1 | Verified |
| Fig. 2.4-8 load cases | Official text, read | — | Uncovered by a test |
| Basic wind speed V (maps Figs. 1.5-1A–D), Kzt (§1.8) | Image-only maps; Kzt is a user input | — | **Uncovered**: user inputs |
| §2.1.5 minimum for open buildings (0,75 kN/m² × Af) on free roofs | — | — | **Uncovered and not applied: a possible unsafe gap at low speeds** (see below) |
| Wind tunnel (Cap. 6), across-wind response, domes, parapets, overhangs | — | — | Not implemented |

### INPRES-CIRSOC 103-2018 Parte I, seismic

| Clause | Source | Test | Status |
|---|---|---|---|
| Tabla 3.1 (as, Ca, Cv per zone and site; Na, Nv in zones 3 and 4) | Official table, parsed | S1, S2 | Verified |
| Tabla 3.2 T3; Tabla 3.3 f1, f2; §2.4 γr | Official text | S1 | Verified |
| Tabla 5.1, rows 2–36 (R, Cd, Ωo); [5.1] R = 1,5 | Official table, 35 rows diffed | S1 | Verified (row 1 is a formula, not implemented) |
| Tablas 6.1 (Cu), 6.2 (Cr, x), 6.3 (eccentricity) | Official tables | S1 | Verified |
| Tabla 2.5 height limits | Official table, at the limit and just above | S1 | Verified |
| Tabla 2.5 regularity for group Ao | Official table | S2 | **Fixed** (#4) |
| [3.1]–[3.4], [3.13], [3.14] spectrum, continuity at T1, T2, T3 | Formula, 12 zone × site cases | S2 | Verified |
| [3.13], [6.8], [6.3], [6.5], [6.1]: Ca, Cv, T2, Ta, C, Vo | EDICI Ingeniería, "Cargas sísmicas según INPRES-CIRSOC 103" (steel shed in Mendoza, 2018 edition; a practitioner's guide) | S3 | Verified |
| [6.11] distribution in height | INPRES/INTI-CIRSOC, "Ejemplo de diseño sísmico de un edificio estructurado con tabiques en voladizo" (P.II 2005), pp. 16–17: every Fk and Vk in both directions (its 1991 formula is the 2018 one word for word) | S3 | Verified |
| [6.5]/[6.6] floors, [6.7] cap, [6.12]/[6.13] switch at 2·T2, §2.7.2/§2.7.3 | Formula, edges | S2 | Verified |
| §3.6 [3.15] seismic weight with snow | Official text | P | **Fixed** (#3) |
| Modal (Cap. 7, 85 % rule, CQC), accidental torsion, 45° direction | — | existing tests | Formula only, no published numbers |
| Damping other than 5 % [3.5]–[3.9], wall period [6.9]/[6.10], Tabla 5.1 row 1, [6.15]/[6.16], Anexo A zoning by locality, site classification | — | — | **Uncovered**: not implemented, or user inputs |

### CIRSOC 104-2005, snow

| Clause | Source | Test | Status |
|---|---|---|---|
| Tablas 1.1–1.15, all 166 rows (locality, district, altitude, pg) | Own parser of the official text, plus a second extraction of the official PDF (sha256 matches `SOURCES.md`) diffed by script | N1 | Verified |
| Tablas 1.8 / 1.13 header localities | Official text | N1 | **Fixed** (#10) |
| Tabla 2 Ce, Tabla 3 Ct, Tabla 4 I | Official text | N1 | Verified |
| (1) pf, §3.4 minimum and its boundaries | INTI-CIRSOC "Comentarios al Reglamento CIRSOC 104", Examples 1 and 3 (pp. Ejemplos-35 to 40) | N1, N2 | Verified |
| (2) ps, Figura 2 Cs | Figure labels (PDF p. 44); Examples 1 and 2 | N1, N2 | Verified |
| §6.1 unbalanced gable, β | Example 1 | N2 | Verified |
| §4.3/§6.2 curved roofs, Figura 3 case 2 | Example 2 | N2 | Verified (cases 1 and 3: formula only) |
| (4) γ, hb, hc, §7.1 drift, w, cap 8hc, windward ¾hd | Example 3 | N2 | Verified |
| Figura 9 hd | Independent re-digitization of the figure's vector paths (PDF p. 49) | N1 | Verified ±0,0105 m (pg below about 0,3–0,45 kN/m² extrapolated) |
| §7.2 adjacent, Cap. 8 parapets, Cap. 9 sliding, Cap. 10 rain on snow, Cap. 5 partial, §6.3, §6.4 | Clause text | N1 | Formula only |
| §4.1 slippery-roof condition (R ≥ 5,3 / 3,5) | Clause text | — | Uncovered: there is no R input. The option's label now states the condition |
| CIRSOC 104 hielo, Figura 1 map, Anexo to Tabla 1.9, §4.5 ice dams, different Ce/Ct/I per roof | — | — | **Uncovered**: not implemented |

## Open items

- **§2.1.5 minimum for open buildings.** CIRSOC 102-2025 asks that the design wind force on an
  open building be at least 0,75 kN/m² × Af. Free roofs (`wind-other.ts`) apply Figuras
  2.4-4 to 2.4-7 without this minimum. At low basic speeds the horizontal force can come out
  below it. Like ASCE 7's commentary, the minimum is best added as a separate horizontal load
  case, not as a scale factor on the pressures. It is left for a follow-up.
- **Ke below sea level.** Tabla 1.12-1 gives Ke > 1 below sea level, and the module's Ke = 1
  is slightly low there. `verification-tables.test.ts` (W1) records this. No Argentine site where it matters was found.
- **Loads not acting, with H.** The argument that dropping the principal load needs no
  combination of its own uses 1,4 D to bound 1,2 D. With H, 1,2 D + 1,6 H is not bounded by
  1,4 D + 1,6 H when D and H act in opposite senses. Earth pressure that opposes is covered by
  the 0,9 / 0 rule, but a model with H and opposing D should state H's sense rather than rely on
  the "both" default.
