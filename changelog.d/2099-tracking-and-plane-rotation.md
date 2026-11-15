### Fixed
#### Preserve small rotated plane stresses and consented conversion events (2026-11-15)

- Compute plane stress rotation from squared sine and cosine products so a much larger normal stress does not erase a small transverse component, including rotation to the principal direction (#2099). The structural engine is unchanged.
- Keep pending account conversions within the tracking session that started them. Registration and first-save events retain their names and hashed identifiers; resetting tracking cannot release an earlier conversion into a later session (#2099).
