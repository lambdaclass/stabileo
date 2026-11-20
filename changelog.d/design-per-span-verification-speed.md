### Fixed
#### Faster concrete span verification (2026-11-20)

Span code checks reuse deferred report formatting and avoid redundant demand-inventory scans. The preliminary pass sizes the shared cage and leaves diagnostics and detailing to the final check.
