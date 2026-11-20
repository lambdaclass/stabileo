### Fixed
#### Check flagship RC design refusals in CI (2026-11-20)

The flagship tests pin the members refused for unsupported shear depth or joint congestion and check that those beams receive no certificate or accepted reinforcement. The browser checks count the refusals without reporting them as verified (#2338).
