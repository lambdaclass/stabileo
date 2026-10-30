### Fixed
#### Ferrari & Sigmund 2025 research page shows the frame in the viewer (2026-10-30)

Fix the Ferrari–Sigmund research frame display during replay and live computation with an explicit uncoloured viewer mode. Bring its experiment into the initial mobile/tablet viewport, enforce readable viewer status text and 44px controls, and add rendering, displacement and responsive regressions. Record the post-launch review without changing the paper’s first-version stage.

The frame could disappear because its members have no scalar values to colour (#848). Re-check
both replay and live computation, including on phones and tablets: the geometry and displacement
must remain visible, with viewer text at least 12 px. This repairs the display, not the solver or
the unfinished Koiter comparisons.
