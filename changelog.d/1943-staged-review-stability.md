### Fixed
#### Staged stability checks preserve inactive physical DOFs

- Fix staged inactive DOF handling for partial constraints and multi-stage erection, refuse nonzero reduced loads on free inactive DOFs, and keep inactive solve pins out of physical reactions. Require SPD factorization, conditional refinement and finite stage solutions. Preserve kinematic mechanism diagnostics and rigid-plastic solvability, and accept rotational support springs at hinged pinned and roller nodes. Broaden staged result re-checks and the SA-2026-060 draft to include multi-member translations and member actions (#1846, #1943).
