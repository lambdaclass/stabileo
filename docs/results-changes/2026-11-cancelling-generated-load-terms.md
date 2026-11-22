# Cancelling terms in tendon and planar loads

A straight eccentric tendon can leave a rounding residual when the terms of its anchor slopes cancel. The assembled loads now carry those term magnitudes into the check, along with the magnitudes from curved-tendon line loads and the products that transfer forces into moments. The guard compares each force and moment component with an allowance of 128 times machine epsilon times the larger of the entered and assembled absolute contribution sums. The tendon equations and equivalent loads are unchanged.

An axis-aligned global point or distributed load on a nearly parallel or perpendicular planar member can have a very small projection onto one member axis. That projection cancels an equal contribution from the other axis in global coordinates. Once either projection is large enough to assemble, conversion retains the pair. The check continues to refuse a missing independent component.
