### BREAKING (results)

#### Continuation, rotated members and SSI preserve physical equilibrium

- Continue from active support positions, retain small chord rotations on rotated members, and check SSI against the reported soil-curve reactions. Mixed point models include soil stiffness and prescribed motion in their physical scales. Invalid custom curve origins and duplicate displacement points refuse.
- Preserve nonzero prescribed settlements and other-node loads in inclined equilibrium summaries. Restore the existing arc-length path parameterization, reproducing the unchanged Roorda replay. Saved-result notices cover shells and point models, including support-curve SSI recorded by the static workflow (#761, PR #1940). See [the results-change record](docs/results-changes/2026-11-continuation-and-curve-reactions.md).
