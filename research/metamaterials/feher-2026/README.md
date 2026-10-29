# Fehér (2026): source and production-API audit

Research, not a design tool. Reproduction not implemented; 0 reviews.

## Sources checked

Eszter Fehér, “Controlling the snap-through behavior of an elastica strip by cuts”,
European Journal of Mechanics - A/Solids (2026), DOI:
https://doi.org/10.1016/j.euromechsol.2026.106217.

The DOI landing page was inaccessible to the browser retrieval tool on 2026-10-29.
The full open preprint was readable:
https://arxiv.org/html/2601.20793v2 (25 May 2026).
No figures, reference code or paper text have been copied.

The catalogue checker's Crossref lookup confirms the title, author, year and
venue recorded in `research/papers.yaml`. Catalogue tests, offline catalogue
validation (48 entries), JSON export and research isolation checks pass.
Implementation-dependent engine, web and browser checks have not been run.

## Model and feasibility

Section 2.1 describes an initially flat strip bent between vertical clamps.
Equations (4)–(7) prescribe endpoint tangents +π/2 and −π/2, horizontal
separation B, and equal endpoint heights. The resulting arch therefore stores
bending energy before the midpoint load is applied. Equations (2)–(3) define
the effective width and bending inertia, including linear transitions around
the two central edge cuts. Self-weight is also included in the paper.

The production `ArcLengthInput` in `engine/src/solver/arc_length.rs` exposes
the solver model and continuation controls, but no initial displacement,
initial stress or restart state. `solve_arc_length` starts at zero displacement
and zero load factor, and explicitly refuses prescribed displacements and
thermal loads. The corotational elements measure deformation relative to their
input geometry. Supplying an already curved mesh would therefore model a
stress-free manufactured arch, not this initially flat, bent strip.

Effort/impact: the viewer and variable section inputs are reusable, but faithful
initial-state preparation is unsupported by this API. With engine numerics
changes prohibited, this is a model-fidelity blocker rather than a missing UI.
A stress-free arch with locally reduced stiffness could be a separately labelled
surrogate; it must not claim to reproduce Fehér's elastica or its limit loads.

## Not yet

- Initial bending stress and the paper's vertically clamped equilibrium.
- Native or WASM limit-load computation for that model.
- Uncut elastica reference comparison and regression test.
- Paper-specific cut cases, limit loads and bifurcation classifications.
- Published curves, experiments, self-weight and mesh convergence comparisons.
- Interactive page, gallery promotion, responsive e2e checks and reviews.

Reference versus Stabileo numbers: none for this model. No paper-specific number
has been compared, and no first-version implementation or validation is claimed.
