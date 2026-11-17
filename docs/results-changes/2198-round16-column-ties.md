# Column ties use column shear spacing and actual cage geometry (2026-11-17)

Round 16 of #2198, within the existing SA-075 work. No advisory is created here.
The [numerical record](2198-round16-column-ties.json) contains every changed
member, its before/after reinforcement and utilization, all eight requested
refusals, and the isolated replays. Parent: `67a9381a6`.

## Authority and resulting behavior

The repository's CIRSOC 201-2025 text, Chapter 10, §10.6.2.1 says:
“Debe colocarse un área mínima de armadura para corte, Av,min, en todas las
regiones donde Vu > 0,5φVc.” Section 10.7.6.5.1 begins “Cuando se requiera”.
Section 10.7.6.5.2 then requires the **column** shear-reinforcement spacing
of Table 10.7.6.5.2. Its nonprestressed column limits are the smaller of d/2
and 400 mm in the lower Vs row, and d/4 and 200 mm above 0.33√f'c·bw·d.
Unlike beam Table 9.7.6.2.2, it has no across-width column.

One shared column evaluator now gates that table on the unrounded engine
φVc and uses the engine's provided Vs, the quantity printed in the column
table. Rectangular and shaped column checks call it after evaluating each
concurrent demand. The ordinary longitudinal-bar restraint/tie spacing
check, §25.7.2.1, remains applicable. A 300 mm square column with eight Ø16
bars and Ø8 ties at 200 mm therefore retains its correct low-shear answer.
The equality Vu = 0.5φVc is on the ordinary-tie side. The spacing limit and
both table rows retain their existing numerical slack and exact boundaries.
The source is
[Chapter 10](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-10-columnas.md),
pp. 220 and 226, and
[Chapter 25](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-25-detalles-de-armado.md),
§25.7.2.1. No unavailable 2005 provision is inferred: its unsupported spacing
verdict remains explicit.

Rectangular column bar layout and both directional shear depths now take
one resolved **provided tie diameter**. Previously they read the nominal
section diameter. The spatial regression oracle had repeated that mistake,
so a Ø6 provided tie paired with a nominal Ø8 section could pass the test
with the wrong depth. The corrected oracle covers Ø6, Ø8 and Ø12 ties.
A larger tie reduces effective depth and can turn a strength pass into a
failure; a smaller tie can increase capacity and change the selected bars.
The column shear check also supplies its clause explicitly to the report
row, which preserves 10.7.6.5.2 instead of labeling it as ordinary tie spacing.

The directional leg-distribution failure is now a structured verification
step with a nested, translated direction. All fifteen dictionaries contain
its explanation and both direction labels. The existing deferred-step
pipeline preserves structured steps; locale rendering uses the common
engine-message boundary. No Spanish sentence containing raw primary/secondary
tokens is emitted for this failure.

## Flagship audit and acceptance

All replays use the real WASM solver and the declared-gravity 408-member
fixture, in this worktree, with the same search limits.

| Replay | Verified | Exhausted | Fingerprint |
| --- | ---: | ---: | --- |
| Parent | 368 | 27 | `b51c20fa1890613c` |
| Column spacing correction alone | 368 | 27 | `b51c20fa1890613c` |
| Provided column diameter correction alone | 369 | 26 | `77af3bd3c8abb955` |
| Both corrections | 369 | 26 | `77af3bd3c8abb955` |

There are no newly refused members. The thirteen biaxial proposals remain
proposals; none acquires a certificate. The **only outcome change is member
185, SEARCH_EXHAUSTED → VERIFIED**, certified utilization 0.9000. Its end
joint is node 38, above column 18. Correcting column 18's actual Ø6 tie
geometry changes its accepted layout from 24 Ø12 bars to 8 Ø20 bars. The
beam search can then select seven Ø12 bottom bars and eight Ø10 bars at
each top end, with Ø6 cages at 150 mm, while satisfying closure, anchorage,
strength and joint clearance. The former retained beam proposal failed its
end joint against 24 column bars, with 8.6 mm reported overlap. This is a
geometry/search consequence of the diameter correction, not a member
restored by relaxing spacing.

Forty-five columns change certified utilization; columns 3, 6, 10 and 18
also select different reinforcement. Every one is individually listed with
its reason in the JSON record. The other 362 members retain their outcome,
constraints, accepted reinforcement and certified utilization. The complete
shared declared-gravity baseline is updated to these audited member lines,
counts and fingerprint. Historical undeclared-role evidence is unchanged.

## Each of the eight previously refused members

**None is restored**, including in the spacing-only isolation. Their former
accepted candidates still fail at both ends against the designed column
cages. The applicable requirements are §25.7.1.2 (each stirrup bend must
contain a longitudinal bar), together with the bar-clearance requirements
of §25.2.1 and §25.2.3. Closure is mandatory when forming the eligible layout
domain; joint clearance is tested only within that domain. Search exhaustion
states that no implemented alternative verified, not that reinforcement is
mathematically impossible.

| Member | Restored? | Governing refusal after this fix | Former candidate's start/end evidence |
| --- | --- | --- | --- |
| 180 | No | §25.7.1.2 and joint clearance, §§25.2.1/25.2.3; anchorage also remains in its outcome | 8.4 / 11.8 mm overlap |
| 181 | No | §25.7.1.2 and joint clearance, §§25.2.1/25.2.3 | 11.8 / 8.4 mm overlap |
| 186 | No | §25.7.1.2 and joint clearance, §§25.2.1/25.2.3; anchorage also remains in its outcome | 8.4 / 11.8 mm overlap |
| 187 | No | §25.7.1.2 and joint clearance, §§25.2.1/25.2.3 | 11.8 / 8.4 mm overlap |
| 192 | No | §25.7.1.2 and joint clearance, §§25.2.1/25.2.3 | 18.0 / 18.0 mm overlap |
| 195 | No | §25.7.1.2 and joint clearance, §§25.2.1/25.2.3 | 20.0 / 20.0 mm overlap |
| 197 | No | No admissible closed layout, §25.7.1.2 | Empty eligible domain at both ends; zero is a sentinel, not a passing clearance |
| 198 | No | §25.7.1.2 and joint clearance, §§25.2.1/25.2.3; anchorage also remains in its outcome | 6.9 / 6.6 mm overlap |

The retained proposals, former accepted candidates, exact overlaps, node
IDs and failed checks are recorded separately in JSON. A retained proposal's
constraint list can include anchorage even when its final failed rows only
name joint clearance; it is not an independent proof of impossibility.

## Validation and exposure

The enabled commit-A reproducers fail on parent production: 58 failed and
18 passed under the reproducer filter. Supplemental final geometry checks
also fail under parent source replay: 79 failed / 264 passed across the two
provided-cage files. The corrected focused tests cover both directions,
axis mappings, editions, direct and adapter calls, rectangular and shaped
columns, threshold/row/spacing boundaries, valid negative controls, nominal
diameter independence, and real planar/spatial linear/P-delta solves with
compact/full transfers. The verifier is TypeScript; there is no separate
native implementation of this column geometry or spacing gate.

The initial requested design/detailing area run passed 2359 tests and failed
ten. Five failures are the explicitly audited digest/aggregate expectations
updated here. The other five failures are reproduced on parent production
in `issue-2171-flagship`, `lateral-fixtures` (two), `coverage-outcomes`, and
`transverse-coverage`. They retain stale closure/population or structured
message expectations; they are not rebaselined here. These outstanding area
failures are not claimed as passing validation.

An isolated replay of `origin/main`'s station verifier reports 234.08 kN
where the provided Ø12 tie's actual-depth oracle gives 230.46 kN. At Vu =
230.69046 kN it reports ratio 0.986, generic near-limit `warn`, overall `warn`,
and **no failed checks**. That warning does not identify the wrong geometry
or capacity. The numerical record pins the origin/main revision and model.
This was the origin/main source against current dependencies/WASM, not a
complete origin/main checkout or release test. It is evidence for the
coordinator's existing SA-075 exposure assessment; no new advisory or number
is assigned here. The separate torsion.ts:82 blocker #2225 is unchanged.
