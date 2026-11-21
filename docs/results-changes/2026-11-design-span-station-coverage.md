# Complete station grids for design spans

Design reuses the span coordinates of each piece's declared stations. Every active combination must supply force tuples at those stations before design can use the span. Each piece must supply its own endpoint values at a shared joint. A missing tuple now blocks demand assembly and produces a translated design refusal. Combination-specific extrema remain available, and complete results use the same force values and transformations.

The reproducer is a simply supported 6 m beam with three pieces and two uniform-load combinations. With both grids complete, the governing midspan moment is 47.25 kN·m. Removing the stronger combination's midspan tuple caused the branch to report 45 kN·m from the other combination. That input is now refused.

In the same beam, keeping one combination and removing its entire result from the middle piece used to leave span assembly without a grouped result or a diagnostic. The span merger now checks the middle piece's declared grid even when it supplies no combination rows. It reports the missing piece for the surviving combination. If no combination can be identified anywhere in a span with declared stations, it refuses the missing scope.
