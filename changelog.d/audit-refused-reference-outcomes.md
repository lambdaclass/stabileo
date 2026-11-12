### Fixed

#### Keep refused reference measurements in the soundness audit (2026-11-12)

Retain successful baseline reference measurements whose head solve refuses, including their refusal text and an explicit outcome count. Share outcome construction across generic and formula-derived references. Preserve varied runner arguments in collector tests by passing the evidence directory directly, and verify that reading runner arguments makes the regression test fail. Rerun available archived evidence without changing engineering conclusions; document that model attribution remains value-based and can be ambiguous where values coincide. Engine results are unchanged. Fixes #1946.
