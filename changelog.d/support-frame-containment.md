### BREAKING (results)
#### Block edits that can change a roller’s restrained axes (2026-11-19)

Transforms refuse an ambiguous memberless 3D roller, and copies that carry a local plane roller require its reference members. Moves and copies are refused if their final geometry would redirect a local plane roller, including after a weld, a repeat link, or a rigid turn without welds. Snapshots preserve the recorded roller type. Selecting an ambiguous 3D Z roller after a snapshot requires explicit restraints (#2289, #2294, #2304).
