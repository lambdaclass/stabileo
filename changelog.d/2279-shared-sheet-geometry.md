### Fixed
#### Restore shared physical geometry in document sheets (2026-11-17)

Both sheet-set builders again render document drawings through the store's physical frame and cached scene. Existing model-only plans and sheet composition remain available. Restore main's canonical flexure implementation, isolate the sheets' minimum-steel policy in their adapter, retain the generated result traversal keys, and preserve the Hungarian game hint. PR #2279.

BREAKING (results): Compared with the unmerged reinforcement-sheet preview, sheet flexure requirements now derive their minimum from the canonical engine result. Rebuild preview sheets before issuing them. Main's canonical flexure answers and committed numerical snapshots are unchanged. See `docs/results-changes/2279-sheet-policy-isolation.md`.
