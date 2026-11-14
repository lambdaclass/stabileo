# PR #2080 round 11 reference audit

The reviewed head is `96147bc617`. This correction changes a reference-test input conversion and the existing steel Cb notice's quantity metadata. It changes no engine implementation, analysis result, design result or committed numerical snapshot.

## Published FSR reference

The INTI CIRSOC_FLEX workbook was obtained from the [download linked by José Prati](https://ingenierojoseprati.com.ar/calculo-y-verificacion-de-secciones-de-hormigon-armado-cirsoc-201-05-todo-en-excel/): [archive](https://drive.google.com/uc?export=download&id=1aqSt6IfzAoNY9lfoOSNnOheWGLfGoBMz). The extracted `CIRSOC-FLEX_Design and Verification-Estructuras de Hormigon Armado.xls` has SHA-256 `37d78241c3e912743d064f2086a54ebae91e066804640614a1355e0571906254`. It was inspected with xlrd; macros were not executed. The workbook itself is not redistributed.

FSR G29 gives 0.034 m as the effective cover to the bar axis, and AE25 gives d = 0.366 m. G23 and G25 give b = 0.12 m and h = 0.40 m; G36 gives Mu = 52 kN·m. The sheet does not specify separate longitudinal bar or stirrup diameters. It sizes a continuous steel area at the specified centroid.

The reference test had translated the centroid into clear cover using an assumed 16 mm bar, then checked an automatically selected 20 mm bar. Following round 8, `d` correctly denotes the selected bars' depth. With that fixture's clear cover, d was 0.364 m; `designDepth` remained 0.366 m. The test was comparing different geometries.

The FSR fixture now states 20 mm for its sizing-depth assumption and converts its 34 mm centroid using that diameter. Zero stirrup diameter remains an adapter convention, not a claim about the published reinforcement. The automatically selected bars remain two 20 mm bars, and both sizing and provided reinforcement have d = 0.366 m. All existing expected values and tolerances are unchanged. The centroid regression checks that the two depths agree; a future change in selected diameter must continue to represent the published centroid or fail that test.

## Reviewed steel and biaxial findings

At `96147bc617`, `design.steel[e12]` already records engine.unityRatio, interaction.ratio and both certified bounds as 0.009475375203. `make snapshots-update FILTER=design-steel-3d-tower` regenerates the tower through the registered application path without a snapshot diff. The checker evaluates each concurrent demand with `verifyByFlange`, selects individual checks from those runs and replaces interaction using concurrent demands. No new summary repair is needed at this head.

`verifyConcurrentElement` selects column and biaxial cases independently. Top-level Mu belongs to the column case; each `BiaxialResult` retains its own Nu, Muy, Muz and Mres. `normalizeCirsoc201` already reads the row demand from that result's Mres, with its own governing combination. It never forms a pair from top-level Mu. Tests use different governing column and biaxial cases, both axes, both editions, columns and walls, and both primary-moment signs. Direct, prepared and aggregate verification results are covered. Replacing top-level Mu leaves the row's own resultant unchanged. These web adapters share the same WASM kernel and concurrent result contract; no native implementation of this normalization exists.

The immutable reviewed snapshot and normalized-row checks pass on the parent implementation. To establish that they reject the reported defects, the local audit temporarily substituted the reported stale e12 summary and `Math.hypot(v.Mu, v.biaxial.Muy)` in the normalizer. All 17 coherence tests failed. Both mutations were restored before final verification. These tests protect existing fixes, not new numerical corrections.

The recorded `origin/main` is `fb241aa04936a993a3ecd4a2ec4f9490669c1d34`. Its committed tower snapshot does contain the stale engine summary 0.01113210824 alongside interaction.ratio and the certificate lower bound 0.009475375203. Its engine.pass is true and diagnostics are absent, but the member's overallStatus is held and its member verdict is unavailable for the existing C.1 first-order-moments refusal. This is evidence of inconsistent reporting on main, not a newly demonstrated silent passing member verdict. No advisory was added.

## Test evidence

Commit `7662ee428` introduces the reference centroid and quantity regressions with Vitest's known-wrong skips (the equivalent of Rust ignores for these TypeScript tests). Running with `RUN_KNOWN_WRONG=1` on that commit produces three failures: the unchanged published depth assertion, the new centroid assertion and the quantity declaration assertion; 32 tests pass. Normal execution has 32 passes and three skips.

After the fixture and metadata correction, all 35 targeted tests pass without skips. The existing notice now declares exactly `member` and `steel`; positive field-coverage checks and unrelated RC/analysis negative controls verify its scope. No result-version increment or new results-change registry entry is needed because no engine result changed.
