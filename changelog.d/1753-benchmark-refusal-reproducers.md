### Changed

#### Restore main shell benchmark assertions as refusal reproducers (2026-11-10)

Restore the Raasch hook and spherical cap benchmark names, references and assertions from main for PR #1753. The four regressions remain explicitly ignored as known wrong results while the gate is unresolved. Measurements show that separate condition-number and anisotropy limits cannot both admit the benchmark models and retain the #993 refusal. The solver gate and benchmark tolerances are unchanged.
