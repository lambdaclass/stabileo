### Fixed
#### Member recovery preserves shear rigidity and valid spatial stiffness (2026-11-15)

Forward shear rigidity through the planar deflection and rotation adapters, and preserve small scalar span loads when sharing their request builder. Preserve spatial recovery for every finite positive bending stiffness while retaining planar stiffness refusals. Hover displacement now reads the drawing's shared Rust curve evaluation before world coordinates are added, so certificate comparisons avoid coordinate cancellation. These correct regressions on the unmerged #2143 branch (PR #2170); nodal solutions and certificate bounds are unchanged.
