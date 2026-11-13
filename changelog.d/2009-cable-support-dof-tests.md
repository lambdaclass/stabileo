### Fixed

#### Check cable refusal for every prescribed support direction

Native and WASM cable regression tests now isolate every 2D and 3D support translation and rotation. Both native cable entry points check nonzero motion down to adjacent-to-zero values of either sign, while absent motion and signed zero retain the loaded answer (#2009). Engine results are unchanged.
