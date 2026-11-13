### Fixed

#### Verify released rotations by their physical work

The released-load native/WASM checks now independently require zero condensed load and member end moment on released axes. Gauge directions come from model stiffness; all translations, retained rotations, member forces and reactions keep the existing strict comparison factor. Mutation controls reject WASM-only, native-only and shared physical corruption (#2074).
