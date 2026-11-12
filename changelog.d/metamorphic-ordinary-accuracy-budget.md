### Fixed

#### Preserve ordinary metamorphic comparison budgets (2026-11-12)

Restore the original maximum of the relative allowance and the matching absolute accuracy bound in metamorphic comparisons (#1991). Ordinary response ratios remain bit-for-bit unchanged; bounds stay local to their result component, and assembly uncertainty remains confined to static-equivalent member reversal. The existing ratio guard and seeded wrong-result checks remain unchanged. Production analysis results are unchanged.
