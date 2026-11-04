### Changed
#### One nightly finding per root cause, not one per node or element (2026-11-01)

The nightly bug hunt grouped its findings by a fingerprint that kept node and element ids, so one
root cause opened many issues (30 for one shell stress label). Ids are now normalised before
fingerprinting (#1062); distinct quantities stay distinct. No calculation changes.
