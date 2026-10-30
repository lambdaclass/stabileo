### Added
#### Results snapshot gate: envelopes, newly produced results and removed cases count (2026-10-28)

The results snapshot gate (#716) now also records the combinations' envelopes and the combination
that governs each member, counts a result the app starts producing (another combination, mode or
limit state) as a change to register, and fails when a corpus case is removed without deleting
its snapshot, so the deletion is registered too. A spectral mode's participation is compared by
magnitude, since its sign is the eigenvector's. Nothing an engineer sees changes.
