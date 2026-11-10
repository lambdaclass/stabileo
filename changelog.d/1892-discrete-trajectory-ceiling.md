### Fixed

#### Certify correct discrete trajectories and require dynamic mirror coverage (2026-11-10)

Time-history accuracy certification now checks the assembled Newmark recurrence to operation-count roundoff before allowing damping uncertainty to contribute to the comparison budget. Correct trajectories remain certifiable; zero and scaled trajectories still fail. The generated 3D time-history and harmonic masks require all 128 mirror comparisons, and the PR coverage table records these passing cells. Preserve main's harmonic symmetry floors when merging public-result diagnostic checks. No engine result, relative tolerance or numeric coverage baseline changes.
