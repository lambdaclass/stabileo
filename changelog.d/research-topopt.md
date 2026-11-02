### Added
#### Runnable MBB topology optimization research experiment (2026-10-29)

Add an isolated Andreassen et al. experiment: SIMP/OC on the engine's sparse Cholesky, both original filters, full-precision Octave reference capture, and a shared-viewer research page with replay and live worker computation. Numerical agreement is distinct from experimental validation; no published-figure agreement is claimed. Round 2 reviewed by Kimi, Codex and Claude (2026-10-31): the page names its comparison source (the unmodified top88.m in GNU Octave) instead of a not-compared placeholder, with measured iteration counts, 44 px controls and 12 px text, the viewer near the top, keyboard pan and zoom with a data table, and Escape closing the viewer menu.

The filter selector also has its own accessible label, so assistive technology reads the control
name without appending all its options (#857). Re-check the density and sensitivity filter
choices when replaying or recomputing the example.
