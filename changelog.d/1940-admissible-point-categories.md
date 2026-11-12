### BREAKING (results)

#### Solve constrained point models using admissible DOF categories

- Coincident spring models no longer require rotational stiffness when constraints eliminate every rotational motion (#761, PR #1940).
- The WASM cantilever regression checks signed displacement components and rejects reversed and transverse responses. See [the results-change record](docs/results-changes/2026-11-admissible-point-categories.md).
