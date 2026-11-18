### Fixed
#### Corrected modal playback and stalled figure rotation in the landing hero (2026-11-18)

All three modal animations use the same time scale, so their relative speeds match the displayed frequency ratios. The carousel skips figures whose chunks fail or take more than two seconds to load. A pending automatic switch respects pointer hover and reduced motion.
