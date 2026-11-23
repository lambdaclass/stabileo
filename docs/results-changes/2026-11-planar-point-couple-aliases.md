# Legacy planar point-couple aliases

Issue [#2411](https://github.com/lambdaclass/stabileo/issues/2411).

The planar member-load fields `my` and `mz` name the same couple. A zero field now yields to a nonzero value in its alias. Equal nonzero fields apply one couple. Conflicting nonzero fields or invalid values stop the solve and identify the load and member.

In the regression model, a horizontal cantilever carries an interior point load with `p: 0, my: 0, mz: 5` at midspan. Moment equilibrium requires a 5 kN·m jump there. The previous solve succeeded with a zero jump. The recovered member moment now jumps by 5 kN·m at the load position.

The alias rule also applies to pure couples at the authored start of a member without a usable projection. Other active planar loads on such members still require an explicitly oriented spatial load.

Rerun affected analyses and downstream design checks. For a refused record, enter the intended couple in a single field.
