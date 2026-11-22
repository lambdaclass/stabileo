# MacNeal–Harder (1985): engine benchmarks

Live page: `/research/benchmarks/macneal-harder-1985`. The production engine runs twelve cases
from one case file, `engine/tests/benchmarks/macneal_harder.json`, which the native tests read too.

- **Shell cases (paper reference), 2/6 within 2%; two fail and two are withheld by the engine.**
  The straight cantilever (Fig. 4, p. 7) with regular, trapezoidal and parallelogram 6×1 MITC4
  meshes, loaded out of plane and in plane. The two distorted in-plane cases are withheld by the
  engine (known issue #798, SH-MITC4-DISTORTION): they have no computed value or error, stay in
  the denominator and are not accuracy passes.
- **Frame adaptations (analytical reference), 6/6 within 2%.** Euler–Bernoulli cantilevers,
  PL³/(3EI), ML²/(2EI), ML/(EI); not problems from the paper.

## Published values

We read the article in a scanned copy (Finite Elements in Analysis and Design 1 (1985) 3–20);
the publisher's online version was not inspected.

- Fig. 4, p. 7: length 6.0, width 0.2, depth 0.1, E = 1.0 × 10⁷, ν = 0.30, mesh 6 × 1, unit
  forces at the free end. Trapezoidal and parallelogram elements are skewed by 45°.
- Table 3, p. 10: theoretical tip displacement in the direction of the load, straight beam:
  in-plane shear **0.1081**, out-of-plane shear **0.4321**.
- Table 5(a), p. 11, Scordelis–Lo roof: 0.3086 is quoted from Scordelis and Lo; the paper uses
  **0.3024** for normalization because many elements converge slightly below 0.3086. We compare
  with 0.3024, the value the paper normalizes by.
- Table 5(b), p. 11: spherical shell normalization value 0.0940 (not compared: the shell obstacle
  course hemisphere uses a different load convention and is withheld by the engine, #798).
- p. 14: grade A means an error of at most 2%, grade B between 2% and 10%.

Timoshenko beam theory with shear factor 5/6 gives 0.4320936 and 0.1080936 from the case inputs,
the printed values to four digits (`macneal_harder::shell_references_match_timoshenko_beam_theory`
and `wasm/check.mjs`).

## The paper against Stabileo

Written by `wasm/check.mjs` to `reference-results/published_comparison.json`; the page shows these
rows. Tolerance: relative error 2%, the paper's own grade A (p. 14).

| Row | Paper | Stabileo | Difference | Verdict |
|---|---:|---:|---:|---|
| Straight cantilever, regular, out-of-plane | 0.4321 | 0.4234856 | 1.99% | pass (marginal: the verdict changes inside the printed rounding) |
| Straight cantilever, regular, in-plane | 0.1081 | 0.1070722 | 0.95% | pass |
| Straight cantilever, trapezoidal, out-of-plane | 0.4321 | 0.4162054 | 3.68% | **fail** (grade B; #798) |
| Straight cantilever, parallelogram, out-of-plane | 0.4321 | 0.4225724 | 2.20% | **fail** (grade B; #798) |
| Scordelis–Lo roof, 16×16 quarter, midside deflection | 0.3024 | 0.3024255 | 0.0084% | pass |

The trapezoidal and parallelogram in-plane cases (Table 3: 0.1081) are withheld by the engine and
have no row: there is no computed value to compare. Because two published values are missed and two
are withheld, `reproduced_published_results` stays `false` and the catalogue status is
`numerically-validated`, not `published-figures-compared`. The roof input is the engine-owned
`shell_obstacle_course.json` case `roof-16` (the paper's Fig. 8 with a 16 × 16 quarter mesh);
its page is the shell obstacle course.

## Validation (VALIDATION.json)

`wasm/check.mjs <native results>` runs the page's case module through the production WASM wrapper,
compares it with the fresh native results, and writes `VALIDATION.json`,
`reference-results/published_comparison.json` and `reference-results/MANIFEST.json` with `--write`.
Without `--write` it recomputes and fails if the committed files differ (1e-9 relative) or if any
check fails. Checks, all passing:

- the eight expected passes (two regular shell cases, six frames) within 2% of their reference;
- Timoshenko beam theory against Table 3 within half a unit of the last printed digit (5e-5);
- the two distorted out-of-plane values pinned to their recorded native values (1e-8 relative):
  a regression bound for a documented failure, not an accuracy claim;
- the two distorted in-plane cases withheld by both native and WASM with #798;
- WASM against native values for every computed case (1e-8 relative);
- the roof against Table 5(a) within 2%.

- References and results are signed, in global axes; a reversed response fails.
- A shell reference printed to four digits is uncertain by ±5e-5; a verdict that would change within
  that interval is reported as marginal.
- A refusal is not an accuracy pass. The two withheld cases keep their inputs and references in the
  case file and carry `expectedRefusal` (#798, SH-MITC4-DISTORTION) instead of a pinned value.
- Web unit tests: `web/src/components/research/macneal1985/__tests__/cases.test.ts`. Browser:
  `web/e2e/research-benchmarks.spec.ts`, including phone and tablet sizes.

## Element skew on the page

The paper's case (45° skew) loads first. For the trapezoidal and parallelogram cases a slider sets
the skew from 0° (the regular mesh) to 45°; each change rebuilds the six-element strip with interior
stations shifted by ±0.1·tan θ at the two edges and reruns the production engine. The variant is
compared with the same Table 3 reference. Unit tests check that 45° rebuilds the case file's meshes
exactly and that 0° gives the regular mesh.

## Reproduce

```sh
MACNEAL_HARDER_RESULTS=/tmp/macneal-native.json cargo test --locked --manifest-path engine/Cargo.toml --test shells macneal_harder::browser_cases
node research/benchmarks/macneal-harder-1985/wasm/check.mjs /tmp/macneal-native.json
```

Inside Nix, prefix both with `nix develop -c`; the engine WASM comes from `make wasm`.

## Reviews

Round 1 (Codex, Kimi) and round 2 (Kimi, Codex, Claude), 2026-10-30. Round 2 fixed: signed
comparison, pinned outcomes, the neutral per-category headline, three failure states, units and
quantities, the stated acceptance policy and marginal verdicts, six languages, viewer strings and
keyboard navigation, the reference provenance, and phone/tablet layout.

## Open questions

- The remaining problems of the set (patch tests in the browser, curved and twisted beams, plates,
  the spherical shell, thick-walled cylinder) and the MITC4 distortion failures and in-plane
  refusals (#798).
