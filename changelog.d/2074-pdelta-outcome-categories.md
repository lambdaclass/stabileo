### Fixed

#### Classify the exact released-load P-Delta unresolved cases

Released-load verification now pins 122 P-Delta fixture identities by outcome: 90 matching native/WASM non-convergences, 28 explicit WASM NaN withholdings, and four models refused on main before P-Delta but admitted by #2023 before reporting non-convergence. The four earlier refusal messages are recorded individually. Every category checks its exact runtime outcome; additional unresolved identities, changed categories and malformed diagnostics still fail verification (#2074).
