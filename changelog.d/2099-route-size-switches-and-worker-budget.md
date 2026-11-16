### Fixed
#### Measure built routes and budget the beam-frame worker (2026-11-16)

Route-size checks use the resolved build switches, report skipped Research and Tools routes when disabled, and still fail for missing enabled entries. The new beam-frame route has a 19,600,000-byte ceiling based on its 18,110,097-byte worker-inclusive measurement with about 8% headroom. Other ceilings and growth allowances are unchanged; the measurement note records all three solver tools including their workers.
