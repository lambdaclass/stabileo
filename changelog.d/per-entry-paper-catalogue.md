### Changed
#### Research papers use one catalogue file per entry (2026-10-29)

Paper additions now edit separate YAML files while preserving catalogue order and the
published JSON exactly. A repeatable migration imports legacy entries after rebasing.
German, French and Turkish locale dictionaries and all steel dictionaries are covered
by the union-merge format and duplicate-key checks.
