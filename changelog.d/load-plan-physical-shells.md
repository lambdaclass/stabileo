### Fixed
#### Generated loads use the analytical shell inventory (2026-11-27)

- Use the analytical mesh for published load previews, roof weights and applied loads. The unified generator requests a mesh for physical plate geometry that a single flat load surface cannot represent and requires a fresh preview when a projected plate changes.
