# Code profile: <country>, <code>

Fill in what you find and leave the rest blank. Give every value its clause, and the page if it
helps the reviewer. Status: `transcribed` (you read it), `checked` (a second person re-read it),
`toConfirm` (not yet compared with the text). The *EN* and *ACI/ASCE* columns show what those
codes put in the same row, so you can see what is asked for.

## 1. Identity

| Field | Value |
|---|---|
| Country | |
| Code and edition (loads) | |
| Code and edition (concrete) | |
| Amendments and national annexes | |
| Mandatory? Since when? | |
| Language of the official text | |
| Derives from (EN, ACI/ASCE, BS, DIN, other) | |
| Safety format (limit states / allowable stresses) | |
| Published worked examples (title, edition) | |
| Maintainers (GitHub handles) | |

## 2. Loads

### 2.1 Combinations

Enumerated list (write each one as `1.2 D + 1.6 L + 0.5 (Lr or S)`) or generated with ψ factors.

| Item | Value | Clause | Status | EN | ACI/ASCE |
|---|---|---|---|---|---|
| Form (enumerated / ψ factors) | | | | generated | enumerated |
| γ permanent, unfavourable | | | | 1.35 | 1.2 |
| γ permanent, favourable | | | | 1.0 | 0.9 |
| γ variable | | | | 1.5 | 1.6 |
| ξ reduction on permanent | | | | 0.85 | |
| Actions that never act together | | | | roof live with snow or wind | |
| Exceptions (e.g. reduced L factor) | | | | | 0.5 L if Lo ≤ 100 psf |

ψ factors (if generated):

| Action | ψ0 | ψ1 | ψ2 | Clause | Status |
|---|---|---|---|---|---|
| Imposed, residential | | | | | |
| Imposed, offices | | | | | |
| Imposed, assembly | | | | | |
| Imposed, shops | | | | | |
| Imposed, storage | | | | | |
| Roofs | | | | | |
| Snow | | | | | |
| Wind | | | | | |
| Temperature | | | | | |

### 2.2 Imposed loads

| Occupancy | q (kN/m²) | Q (kN) | Not reducible? | Clause | Status |
|---|---|---|---|---|---|
| | | | | | |

| Item | Value | Clause | Status | EN | ACI/ASCE |
|---|---|---|---|---|---|
| Reduction by area (formula, limits) | | | | αA = 5/7·ψ0 + A0/A | KLL·AT ≥ 37 m² |
| Reduction by floors | | | | αn | floor 0.5 / 0.4 |
| Partitions | | | | 0.5 / 0.8 / 1.2 | ≥ 0.72 kN/m² |
| Roof imposed load | | | | | |

### 2.3 Wind, 2.4 Snow, 2.5 Seismic

| Item | Value | Unit | Clause | Status |
|---|---|---|---|---|
| Basic wind speed (gust or mean, return period, map) | | | | |
| Profile with height (power law, logarithmic, bands) and its constants | | | | |
| Air density | | | | |
| Pressure coefficients (walls, roofs) | | | | |
| Ground snow load (map, formula with altitude) | | | | |
| Exposure, thermal and importance factors | | | | |
| Roof shape coefficients, drifts | | | | |
| Seismic hazard parameters and zones | | | | |
| Soil classes and site factors | | | | |
| Spectrum shape (plateau, corner periods) | | | | |
| Importance factors | | | | |
| Structural systems and reduction factors | | | | |
| Period formula (Ct, exponent, cap) | | | | |
| Seismic mass (share of imposed load) | | | | |

## 3. Reinforced concrete

| Item | Value | Unit | Clause | Status | EN | ACI |
|---|---|---|---|---|---|---|
| Specimen (cylinder / cube), concrete grades | | | | | C12/15–C90/105 | f'c |
| Steel grades | | MPa | | | B500 | Grade 60 |
| Bar diameters | | mm | | | | |
| Ultimate concrete strain | | - | | | 0.0035 | 0.003 |
| Stress block | | | | | λ 0.8, η 1 | β1(f'c) |
| γc / γs, or φ by failure mode | | - | | | 1.5 / 1.15 | 0.90 / 0.65 / 0.75 |
| Long-term factor on fc (flexure, shear) | | - | | | αcc 1.0 | |
| Minimum beam steel | | | | | max(0.26 fctm/fyk; 0.0013)·bt·d | |
| Maximum beam steel | | | | | 0.04·Ac | |
| Neutral axis limit without redistribution | | | | | xu/d 0.45 | εt ≥ 0.005 |
| Minimum links, largest link spacing | | | | | 0.08√fck/fyk; 0.75·d | |
| Shear method and limits | | | | | variable strut, cotθ 1–2.5 | √f'c ≤ 8.3 MPa |
| Punching: control perimeter, maximum stress | | | | | 2d; 0.4·ν·fcd | d/2 |
| Anchorage and lap lengths | | | | | fbd = 2.25·η1·η2·fctd | Table 25.4.2.3 |
| Hooks and bend diameters | | | | | 4φ / 7φ | |
| Cover by exposure class | | mm | | | | |
| Crack control (bar size / spacing tables or formula) | | | | | Tables 7.2N, 7.3N | §24.3 |
| Column steel ratio (min, max), thinnest bar | | | | | max(0.1 NEd/fyd; 0.002 Ac), 0.04 Ac, 8 mm | 1–8 % |
| Column slenderness limit | | | | | λlim = 20·A·B·C/√n | |
| Wall minimum steel (vertical, horizontal) | | | | | | |
| Seismic detailing by ductility class | | | | | | Chapter 18 |

## 4. Worked examples

One per topic at least: a combination, a reduced imposed load, wind pressure at a height, snow
on a roof, a spectrum and base shear, flexure, shear, punching, an interaction point,
anchorage and lap, a seismic detail.

| Topic | Source (code commentary, national manual, book, paper) | Inputs | Expected result | Tolerance |
|---|---|---|---|---|
| | | | | |

## 5. What does not fit

Anything the code does that the rows above cannot hold: a procedure with different steps, a
table with an extra dimension, a rule with no counterpart. Each item becomes a request for a hook.
