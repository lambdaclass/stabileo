# SA-2026-030: CIRSOC 301 passed a compression member with Qa ≤ 0 above its squash load

| | |
|---|---|
| Severity | High |
| Status | Draft |
| Issue | [#467](https://github.com/lambdaclass/stabileo/issues/467) |
| Fix | PR [#1246](https://github.com/lambdaclass/stabileo/pull/1246) |
| Affected versions | every release with the engine's CIRSOC 301 check; not bisected |
| Re-check registry | entry `cirsoc301-q-nonpositive-refused` (models with CIRSOC 301 steel members) |

## Affected features

The CIRSOC 301 steel member check in compression (§E.7, slender elements) in the app, and its
WASM entry points (`check_cirsoc301_members`). Every compression path goes through the same
reduction factor: I, U, T, box, RHS and CHS sections, single angles (§E.5) and double angles
(§E.6). The certified (interval) check was not affected: it refused to certify these members.

## What was wrong

§E.7 reduces a section with slender stiffened elements by Qa = Aeff / A, with
Aeff = A − Σ(b − be)·t over its compression elements. The elements' widths and thicknesses come
from the section's b, h, tw and tf, or from the `compressionElements` the section declares; A is
the section's own area. When the two disagree, Σ(b − be)·t can exceed A, and Qa came out
negative. Then λ = √(Q·Fy/Fe) was NaN, the test λ ≤ 1.5 was false, and the elastic branch
returned Fcr = 0.877·Fe with no Q in it. With a short member Fe is very large, so the capacity
was far above the squash load and the member passed. (Qa exactly 0 gave Fcr = 0 and a failing
member, not a pass; it is refused now too, since it is no capacity either.)

The case in #467, a 521 × 521 mm box with 2 mm walls, A = 4 154 mm² (the walls alone give
6 366 mm²), L = 0.5 m, Fy = 235 MPa:

| | Correct | Before the fix |
|---|---|---|
| Qa | not defined (refused) | −2.7·10⁻⁷ |
| Fcr | — | 311 206 MPa |
| φPn | not evaluated: the member is held | 1 098 908 kN |
| Squash load A·Fy | 976 kN | 976 kN |
| Verdict | held, with the reason | pass |

No real section reaches this: it needs an area smaller than the plates the section is made of,
which happens when a custom box or tube is typed with an area that does not match its
dimensions, or with compression elements that do not belong to it. Sections from the catalogue
are consistent and were never affected.

## How to tell if your results are affected

A CIRSOC 301 steel member in compression whose check lists `Q` at or below zero, or an Fcr above
Fy, or a compression capacity φPn above 0.85·A·Fy. After the fix such a member is held with
"the effective area comes out Qa ≤ 0 … (§E.7)" and is never reported as passing.

## Fixed in

PR #1246. The compression check refuses Q ≤ 0 (`c301.refuse.qNonPositive`) and, as a second
guard on every path, any Fcr above Fy (`c301.refuse.fcrAboveFy`), so φPn can never exceed
φc·A·Fy. A compact 200 × 200 × 10 mm box, L = 3 m, is checked against the hand calculation of
E.3: KL/r = 38.62, Fe = 1 323.3 MPa, Fcr = 0.658^0.1776·235 = 218.17 MPa, φPn = 0.85 · 218.17 ·
7 600 / 1 000 = 1 409.3 kN; a demand at the squash load (1 786 kN) or above fails
(`engine/tests/cirsoc301_check.rs`). AISC 360 chapter E in the engine was not affected: an
effective area at or below zero gives a non-positive capacity, which the check reports as not
evaluated.
