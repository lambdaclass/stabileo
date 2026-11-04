### Fixed
#### The nightly Code_Aster comparison no longer fails on a reused runner (2026-11-04)

The Code_Aster comparison installed micromamba into the runner user's home directory, where it
stayed after the job. On a self-hosted runner the next nightly then refused to install over it and
the comparison never ran. Micromamba and its environments now go into the job's temporary
directory, which the runner empties before every job.
