# Preserve load targets and accepted paths in experimental nonlinear analysis (2026-11-23)

With the default-off `experimental-nonlinear` feature, a 2D co-rotational warm
start could report a load factor of one after floating-point subtraction erased
a small target. The same rounding could affect prescribed positions both when
interpolating and when applying a correction. The driver now uses the given
values at either endpoint and assigns the requested support positions directly.
Full-load recovery uses the target model.

Experimental 2D arc length and displacement control use the existing member
load conversion before preparing the reference pattern and recovering results.
Recovery scales the same canonical load the solver assembled. For example, a
member load whose endpoint rounds just beyond the member length now gives the
same displaced state, reactions and member forces as its canonical equivalent.
A warm arc-length start also uses the canonical representation of its base
loads.

Arc-length predictor orientation and corrector root selection use the same
weighted displacement and load projection. A trial with no real intersection
with the requested sphere is retried with a smaller radius. The driver records
a point only when equilibrium and the radius both meet the requested
tolerance. It checks the radius from the actual change in the represented
state. Failed trials restore the accepted displacement exactly and leave the
accepted load factor intact. These changes can affect the reported path,
convergence, iterations and recovered results.

The experimental 3D co-rotational solver already refuses shear-centre offsets
because it omits flexural-torsional coupling. The refusal now examines sections
on the expanded frame model so it also covers sections used by curved beams.
Centered sections and unused catalog sections remain admissible.

This entry belongs to the experimental result registry. The feature remains
off in production.
