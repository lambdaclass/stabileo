### Fixed
#### A large free body is no longer reported with a mode missing (2026-11-25)

The dense elimination found five of the six rigid-body modes of an unsupported slab of 361
nodes. Over 1,500 free degrees of freedom the modes are now counted on the sparse matrix, and
the six are found.
