### Fixed

#### Check the certified stability bound without requiring a tight spectrum (#1753)

Correct the continuous-beam and permuted coupled-mode metamorphic checks to verify the certified upper-bound contract of fast-accepted stiffnesses. Independently certify the beam bound against its assembled stiffness and retain the original tightness assertion on explicit full sparse spectrum tests. Document why the fast bound cannot change conditional accuracy decisions or displayed results. Preserve the slab sweep assertions and timeout. No engine solve or result format changes.
