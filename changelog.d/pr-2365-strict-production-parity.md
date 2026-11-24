### Fixed

#### Pin switch-off production to main (2026-11-21)

The production build uses main's mesher, coordinate conversion and `.ded` reader and writer. Unified plates retain compact refusal evidence and their mesher validation in the opt-in profile.

The plate selection card lives with unified plates so the shared research viewer keeps main's source fingerprint.

After #2409 merged, both profiles use main's mesher input validation. The opt-in profile keeps its own plate mesh planner and pre-analysis preparation uses the inherited invalid-plate and wall-slab refusals.
