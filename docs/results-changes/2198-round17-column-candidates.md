# Column candidates share the required-shear applicability gate (2026-11-17)

Round 17 of #2198 completes the candidate applicability correction from
[round 16](2198-round16-column-ties.md), within the existing SA-075 work.
No new advisory or results version is assigned. The existing
`column-tie-shear-spacing` registry entry now covers automatic candidates too.

## Behavior and authority

The column candidate enumerator previously applied the beam shear-distribution
and spacing seed whenever either directional shear reached 0.001 kN, even where
column shear reinforcement was not required. It now calls the same
`columnShearSpacing` evaluator as the authoritative column verifier. Its
applicability condition is the strict `abs(Vu) > 0.5 * phiVc`, with the engine's
unrounded concrete contribution and each concurrent tuple's signed axial force.
The equality retains ordinary ties. The authority is the repository's
[CIRSOC 201-2025 Chapter 10](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-10-columnas.md),
§10.6.2.1 and §10.7.6.5.2, as recorded in round 16.

The seed evaluates two-leg ties at the widest ordinary spacing offered on the
existing grid, for each trial diameter and each web. Using a dense trial instead
could give a different concrete contribution below minimum shear reinforcement
and incorrectly exempt wider options. Only concurrent tuples that require shear
reinforcement contribute to the spacing/distribution seed. The 2005 behavior,
option bounds, strength verification, closure and joint-clearance requirements
are retained. The existing stronger-secondary-option retention and its zero-rhoW
strength seed are deferred to #2237; the torsion defect is deferred to #2225.
The common applicability evaluator prevents a second independent nonzero-shear
cutoff from disagreeing with the verifier.

## Flagship audit

The [numerical record](2198-round17-column-candidates.json) preserves every
changed reinforcement, utilization and constraint before and after the fix,
with the actual verifier failures for refused proposals. Both replays use the
real WASM solver, the same 408-member declared-gravity fixture and search limits,
and production in this worktree. Parent production is the signed merge
`8a54e83b4`; test-only commit `0aa4478e8` has identical production.

| Replay | Verified | Exhausted | Provisional biaxial | Fingerprint |
| --- | ---: | ---: | ---: | --- |
| Parent | 369 | 26 | 13 | `77af3bd3c8abb955` |
| Corrected candidate applicability | 372 | 23 | 13 | `e61212184720b0b6` |

There are 169 changed member records: all 160 columns and nine beams. Every
accepted arrangement was rechecked by the authoritative verifier in the resulting
model, with no failed check. The changes in column cages also change the joint
geometry available to connected beams. Four beams, 180, 181, 186 and 187, recover
verification with utilization 0.5630. Their newly accepted arrangements contain
four Ø20 bottom bars, six Ø16 bars at each top end, and Ø8 support/span cages
with two primary and three secondary legs at 150 mm. These are newly found
arrangements; no closure check was removed. The other four previously audited
refusals, 192, 195, 197 and 198, remain exhausted.

Member 185 goes from verified to exhausted on anchorage/congestion. Its former
accepted arrangement fails joint threading against the new column arrangements:
28 column bars at start node 33 and 24 at end node 38, with reported overlaps
5.8 mm and 7.3 mm respectively. Its retained proposal also fails threading.
It receives no certificate. Member 162 remains exhausted, with its retained
constraint changing from anchorage/congestion to anchorage alone. Both baseline
tests now require each refused member’s exact audited constraint list. The record contains the exact overlap values and
checks, rather than treating an aggregate improvement as preservation of every
old answer. The shared declared-gravity acceptance record now pins all 408
result lines and the exact new fingerprint. No tolerance or assertion threshold
is relaxed. The undeclared-lateral record is unchanged by this audit.

## Other corrections and reproduction

The old-project recheck fixture legitimately gains `column-tie-shear-spacing`:
it contains concrete frame members and lacks design classification that could
exclude columns. Both SSI-registration variants and the recovery merge-order regression now
expect that exact notice.

All fifteen locale dictionaries are checked for the two secondary-leg detailing
refusals. Arabic, Hindi, Indonesian, Italian, Japanese, Korean, Russian and
Chinese now supply their own translations and preserve both parameters.
The shaped-generator regression explicitly requires shear and tie-spacing
checks to exist before inspecting their statuses.

The round-six documented 2005 secondary capacity is corrected to 443.75 kN:
448.75 × 0.355 / 0.359. The replay returns 443.75 for 2005 and 441.98 for 2025;
two exact assertions pin those answers alongside the independent edition-specific
arithmetic. There is no edition-selection defect.

Commit A records Vitest's repository-recognized ignored reproducer equivalent,
`RUN_KNOWN_WRONG=2198` selecting tests otherwise skipped with a
`known wrong result: #2198` name. The final tests replayed against parent
production and the parent dictionaries yield 282 failures and 473 passing
controls. This includes the exact low-shear failure, both sides and equality of
the applicability threshold, axial tension/compression, both directions and axis
mappings, rectangular/circular/T/L webs, the tie builder and candidate generator,
and real 2D/3D linear/P-delta solves with full and compact station transfer.
The TypeScript candidate enumerator has no separate native entry point; the
unchanged native section evaluator is exercised through WASM. Commit B removes
the ignores. No full suite or heavy run is required for these replays.
