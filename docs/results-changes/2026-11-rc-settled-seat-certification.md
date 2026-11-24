# RC beam verification against settled crossing seats

The automatic design run could reuse the authoritative verification of a selected cage from before neighbouring beams had settled at their joints. A later sweep could leave the cage selected under the ranking checks while the authoritative check with the final seats would refuse it. The run now verifies the selected cage with the settled seats before it can issue a certificate. A refused cage removes its seat, and the run rechecks surviving cages against the resulting seats.

Compared with the previous #2338 branch tip on the 408-member flagship fixture, 17 already refused beams now report additional anchorage or congestion findings. All outcome classifications, selected reinforcement hashes and certified utilizations match. The synthetic regression also covers a previously accepted cage becoming refused and a passing cage receiving its updated utilization. The capacity equations are unchanged.

In the slab-mesh fixture, exhausted beams report the longitudinal torsion perimeter diagnostic. Their cages contribute no bars or rows to the bending schedule, so the beam mass and its relative comparison are unavailable.

Re-run automatic concrete design and review flagged seats before relying on its certificates or reinforcement schedules.
