### Performance
#### Linear solves and the gravity load plan cost what they did in October again (2026-11-12)

Since the November safety work a linear solve took 1,5 to 8 times longer than at the end of October (45 times on a 60-DOF frame), every load case of a combination solve paid 15 times its own cost in screens, and the gravity load plan of a 1730-member building took 190 to 290 ms instead of 26. No result changes; the same checks run and give the same answers.

- The small-displacement screen's span rotations are decided with one window per load interval (the exact maximum in 2D; in 3D an upper bound that settles every member within the limit, and only a member beyond it is measured with the 64 windows), its cubic roots and candidate points use fixed arrays instead of allocations, a case without thermal loads does not scan its loads once per member, and the second-order screen looks member lengths up once. Per load case on a 1100-member 2D frame: 12,8 ms to 2,3 ms; on a 220-member 3D frame: 4,8 ms to 0,7 ms.
- The dense Jacobi spectrum of the stability verdict (models under the sparse threshold) stops when a sweep rotates nothing above the rounding of its own rows and columns, the relative rule of Demmel and Veselić, instead of running its 64 sweeps every time: ten sweeps on a 60-DOF frame, the verdict from 5,3 ms to about 2 ms.
- The stability verdict of a stiffness that was just analyzed, with the same tags, coupling and releases, is read back instead of recomputed; the app asks twice per edit (the single solve, then the combinations).
- The gravity load planner tests a point against a member's or a panel's box before its geometry, in the headroom probe and the coverage lookup, and compares squared distances: the 1730-member building plans in 25 to 40 ms.
- The 3D prepared solve builds its known-issue list once instead of twice.
- `cargo bench --bench workflow_bench` runs again: its flat plate is held in plane at a second corner, as the perf gate's plate is, instead of being refused as a mechanism.

New gates hold these, in units of a fixed calibration workload timed on the same thread rather than milliseconds, so they hold on a slow or loaded runner: ten prepared load cases of a 600-member 2D frame within 4,5 calibrations and of a 220-member 3D frame within 3 (12,2 and 9,0 before, 1,6 and 1,1 after), the planner's 1730-member building within 3,2 (panels) and 6 (width) calibrations (4,8 and 9,5 before, 2,0 and 3,5 after), a 60-DOF frame's spectrum within 16 Jacobi sweeps (64 before), and a verdict asked twice analyzed once.
