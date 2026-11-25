### Fixed
#### Safety advisories fixed after 0.6.4 (2026-11-24)

[SA-2026-112](../docs/advisories/SA-2026-112-basic-3d-shell-omission.md) covers Basic 3D analysis that silently omitted all shell elements. Rerun affected load cases and combinations in PRO 3D with the full shell mesh.

[SA-2026-113](../docs/advisories/SA-2026-113-native-supplied-linear-certificates.md) covers native API certificates for supplied linear results that the solver would refuse. Rerun affected load cases and their certification, including dependent combinations and envelopes.
