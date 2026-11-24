# Roundoff allowances for load components

When a member load is resolved along local axes, the terms projected back onto a global axis can cancel. Analysis now keeps their magnitudes through the load check, including when the calculated force or moment is zero. This restores solves such as validation-02, where a vertical member load produced a rounding residue in the assembled moment about the vertical axis.

For each force or moment component, the guard sums the absolute contributions on the entered and assembled sides separately. The allowance is 128 times machine epsilon times the larger sum. Moment contributions include both force–lever-arm products and any applied couple. The allowance from one component cannot cover a discrepancy in another. The solver equations and assembled loads are unchanged.
