### Fixed

#### Preserve signed spatial force bounds and report Excel magnitude peaks

- Spatial force queries, table summaries, and signed detail rows use the
  envelope's constituent cases to preserve both force signs.
- The raw forces report and piece diagrams retain the envelope's separate
  constituent curves and forces in their exports.
- The Excel Summary lists the exact component peaks for an active SRSS or ABS
  combination and marks unavailable values.
