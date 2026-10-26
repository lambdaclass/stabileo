### BREAKING (results)
#### CIRSOC 301 steel verdicts of the design chain, registered (#461, 2026-10-25)

#461 changed steel member verdicts and reached main without a changelog entry or a re-check entry;
both are added now (results version 4, `docs/results-changes/2026-10-design-chain.md`). A limit
state the engine refuses holds the member («not evaluated») instead of failing it with an
infinite ratio. A section that does not state whether it is rolled or welded is checked both ways
and held where they disagree (it was taken as welded unless it came from a rolled catalogue); an
undeclared load height is read on the top flange and, where that fails, on the web. H.1 is rated
on the forces that act together (each combination at each station), so some ratios fall; unbraced
lengths are read per axis and per flange from the bracing; weak-axis shear (G.6) is checked; 0.95
to 1.00 reads as a warning. Cold-formed sections are no longer checked by CIRSOC 301 as if they
were hot-rolled: CIRSOC 303 is not implemented, so they read not designed, and an earlier pass is
not a valid verification. Projects solved before are told so on opening (re-check entries
`cirsoc301-refused-limit-state-holds`, `cirsoc301-undeclared-fabrication-and-load-height`,
`cirsoc301-concurrent-forces-and-lengths`, `cold-formed-not-checked-by-cirsoc301`).
