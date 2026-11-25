# Clip automatic gravity bays by physical headroom

Automatic panel gravity subtracts the low-clearance overlap with retained upper bays before distributing loads to the lower bay's beams. The subtraction uses the two physical deck surfaces across the shared footprint.

In the regression model, the lower 6 m square has corner elevations of 2.9996, 3, 3.0004, and 3 m. The upper square is at 5.20035 m. The region below the 2.2 m headroom limit is a triangle at the high corner with legs of about 0.75 m. The previous planner kept all 36 m². The corrected planner keeps about 35.71875 m² and clips roughly 0.28125 m².

Regenerate affected automatic panel gravity and roof snow loads, then rerun analyses and combinations.
