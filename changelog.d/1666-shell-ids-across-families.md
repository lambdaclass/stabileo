### Fixed
#### Shells of two families with the same id are refused by the combinations and envelopes (2026-11-07)

MITC4, MITC9, solid and curved shells number their ids independently, and the shell stresses of a combination, of the "All loads" view, of an SRSS or ABS combination, of a spectral case, of the envelope and of the slab service deflection were matched by id alone. A model with, say, a MITC4 and a MITC9 both numbered 7 had one of them silently combined in place of the other. Such a result set is now refused with the id named. Models built in the app number all their shells in one sequence and are unaffected; no result changes.
