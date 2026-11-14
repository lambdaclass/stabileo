### Fixed
#### Preserve main registry content and restore Hungarian advisory structure (2026-11-14)

- Preserve every main result-change registry line while adding Hungarian translations, without changing the registry schema.
- Restore two missing safety-advisory blocks and four missing summary rows in Hungarian.
- Load account tracking only when the accounts switch is enabled (#2099).
