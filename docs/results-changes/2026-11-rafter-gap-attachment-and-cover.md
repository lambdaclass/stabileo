# Panel gravity at attached rafter gaps

## Verify rafter gap attachment and width-loaded roof cover

The panel gravity planner derives a gap from shell cells tied to the rafter run at the matching offset and shell cells connected to them by shared edges. A detached shell cannot enlarge the loaded width. The planner names the rafter members and shells when unverified attachment prevents certification.

A bare member receiving roof pressure by tributary width contributes its plan footprint and member elevation to the exposure check for an attached gap. Complete overhead cover assigns floor pressure to the gap. Partial cover blocks plans that need different roof and floor pressures. Snow's geometry preflight uses the entered tributary width for this check.

In the regression model, two attached shell edges establish a 2 m wide gap over a 2 m horizontal run. Detached shell edges used to enlarge the loaded area from 4 m² to 12 m². Another regression places a 3 m wide tributary strip directly above that gap. The entire 4 m² now receives the floor pressure, which is 1 kN/m² in the test, in place of the roof pressure of 2 kN/m².

Regenerate affected panel gravity and snow loads before reanalysing saved projects.
