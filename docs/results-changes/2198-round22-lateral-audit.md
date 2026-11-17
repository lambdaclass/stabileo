# Lateral fixture acceptance audit (#2198, round 22)

This is a test expectation correction against production `6ee1fb233`.
No engine result, numerical rule, search bound, tolerance or result version changes.
No new result-change registry entry is needed. The earlier
[closure correction](2198-rc-baseline-closure.md),
[column tie correction](2198-round16-column-ties.md) and
[column candidate correction](2198-round17-column-candidates.md) already record
and register the production changes. This audit does not overwrite their history.

The declared-gravity run matches every line of the existing shared 408-member
digest, with 372 verified, 23 exhausted and 13 biaxial proposals. The lateral test
still expected 376 verified and 19 exhausted. Its four additional refusals are
192, 195, 197 and 198. They are correct refusals over the implemented alternatives,
not proofs of section inadequacy. Each stirrup bend must enclose a longitudinal
bar (§25.7.1.2), and the resulting eligible layouts must clear the columns' bars
(§§25.2.1 and 25.2.3). The test rechecks their former accepted cages against the
current column arrangements and requires both joint verdicts exactly, including
an empty eligible domain at both ends of member 197. A zero overlap with a false
verdict means an empty domain; it does not mean acceptable clearance.

| Member | Former accepted cage: start / end overlap | Current retained proposal |
| --- | --- | --- |
| 192 | 18 / 18 mm | 23 slots, Ø12 row, largest Ø16; 8 column bars at each end; congestion |
| 195 | 20 / 20 mm | 23 slots, Ø12 row, largest Ø16; 8 column bars at each end; congestion |
| 197 | Empty eligible domain / empty eligible domain | 21 Ø12 slots; start overlaps 28 column bars by 6.0567099456671665 mm; congestion |
| 198 | 6.937258300203045 / 6.599422784699067 mm | Anchorage and congestion; no certificate |

The [machine-readable audit](2198-round22-lateral-audit.json) records both joint
verdicts in metres without rounding. The former cages come from the existing
closure evidence. These four holds predate round 21's document/member generation
gate: the runDesign population is already pinned by the round-17 shared digest.

The previously unaudited current undeclared-role run has 350 verified, 45 exhausted
and the same 13 biaxial proposals. Relative to its historical 362-member
acceptance, members 177–181, 186–187 and 189–191 lose verification on congestion.
Their exact retained-candidate joint verdicts are in the audit. Historical
recoveries 204 and 207 also remain exhausted, on anchorage and congestion. Their
old accepted cages still pass the independent concurrent shear strength and
both spacing calculations in the test, but fail joint clearance at node 56 and
node 60 respectively, by 9.463234383874206 mm. The retained proposal separately
fails anchorage with 19.8 cm available versus 22.1 cm required. The test preserves
all historical member IDs and independently checks each new refusal; it does not
silently drop IDs or discard the shear arithmetic.

Reading the same frame as undeclared loses 24 gravity-verified members:
16 congestion, 1 congestion with flexure, 3 anchorage, 2 anchorage with congestion,
and 2 flexure. It also gains members 192 and 195, whose gravity search is exhausted
on congestion. Thus 372 - 24 + 2 = 350. The exact forward and reverse IDs and
reason counts are pinned, together with every undeclared member's outcome,
constraints and certified utilization to the existing four-decimal precision.
No success-subset assumption is retained after the audit disproves it.
The two recovered undeclared members have certificates; the gravity refusals do not.

All existing lateral-role comparisons, the small answered fixture, member checks,
certificate checks and independent shear arithmetic remain. The added consistency
reproducer fails on parent `6ee1fb233` with the stale 376/19 expectation against
the audited 372/23 member inventory. Commit A marks it and the two existing
failing cases with Vitest's `known wrong result: #2198` skip equivalent; commit B
removes those skips and makes the gravity expectation consume the shared digest.

The axial-force omission in the station verifier's beam spacing-table selection
also exists in `origin/main@44d527d64933c07c8a812f04ad2373e4d83eb72c`.
Per this round's instruction it is deferred to main and is documented in the
worktree handoff. No advisory is added. The zero-rhoW candidate issue #2237 stays
untouched.
