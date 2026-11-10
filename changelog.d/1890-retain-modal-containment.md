### Fixed
#### Keep the modal issue #759 containment ledger consistent (2026-11-10)

The #759 ledger row remains WARN under `MD-ORTHOGONALITY`, matching the runtime registry. PR #1890 strengthens the standalone modal basis check but does not establish a complete fix across harmonic modal superposition and Craig–Bampton reduction, which call the eigensolver without that check. A focused regression prevents the premature CORRECTED disposition from returning. Runtime warnings and numerical results are unchanged.
