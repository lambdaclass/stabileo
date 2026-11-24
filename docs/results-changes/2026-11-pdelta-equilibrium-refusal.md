# P-Delta refuses results that fail the physical equilibrium check

Issue #2100 came from a finite four-member model in the nightly static fuzz run. Its first-order solution succeeds. The P-Delta iterate fails the physical equilibrium check. The native solver returned success with NaNs in the withheld forces and warnings explaining their absence. That success triggered the fuzz harness's non-finite result assertion. WASM and certified solves already refused the result through their output checks.

Both dimensions now refuse the result through the same physical equilibrium check before constructing the reported forces and stresses. The structured error includes the relative residual and requested tolerance when finite. Native and WASM callers receive the same reason, including certified solves.

The check still accepts a finite residual at or below the requested tolerance. A passing residual retains the small-displacement solution and the existing warning for a failed displaced-geometry wrench check. The iteration, residual calculation and tolerance are unchanged. Linear solves of the nightly input still return their first-order results.

The project recheck notice requires both P-Delta history evidence and structural stiffness or constraint features. Structural models with unknown solve history remain eligible for the notice.
