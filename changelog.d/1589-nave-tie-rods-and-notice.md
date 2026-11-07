### Fixed
#### The industrial shed example's tie rods are tension-only, and the containment notice no longer blocks the model (2026-11-06)

- The 116 Ø16 tie rods of the industrial shed example (`3d-nave-industrial`) are now tension-only. Loading an example used to drop a member's behaviour, so the rods were solved as plain truss bars, and 66 of them carried up to 22.7 kN of compression at about 80 times their buckling load.
- Compact share links now keep a member's behaviour. A link with a behaviour the app does not know is refused instead of loading the member as a plain bar.
- The containment notice over the viewport no longer takes the clicks and taps meant for the members under it. On a phone it is one line, with More to read it all.
