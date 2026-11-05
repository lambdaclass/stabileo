# MacNeal–Harder (1985): engine benchmarks

Live page: `/research/benchmarks/macneal-harder-1985`. The production engine runs twelve cases
from one case file, `engine/tests/benchmarks/macneal_harder.json`, which the native tests read too.

- **Shell cases (paper reference), 2/6 within 2%; two fail and two are withheld by the engine.**
  The straight cantilever (Fig. 4, p. 7) with regular, trapezoidal and parallelogram 6×1 MITC4
  meshes, loaded out of plane and in plane. The two distorted in-plane cases are withheld by the
  engine (known issue #798, SH-MITC4-DISTORTION): they have no computed value or error, stay in
  the denominator and are not accuracy passes.
  References 0.4321 and 0.1081 are the theoretical tip displacements in the load direction of
  Table 3, p. 10, according to a public transcription of the paper. Timoshenko beam theory with
  shear factor 5/6 gives 0.4320936 and 0.1080936 from the case inputs, the printed values to
  four digits (`macneal_harder::shell_references_match_timoshenko_beam_theory`).
- **Frame adaptations (analytical reference), 6/6 within 2%.** Euler–Bernoulli cantilevers,
  PL³/(3EI), ML²/(2EI), ML/(EI); not problems from the paper.

## Evidence

| Case | Reference | Computed (native = WASM) | Error | Verdict |
|---|---:|---:|---:|---|
| MITC4 · regular · out-of-plane | 0.4321 | 0.4234856 | 1.99% | pass, marginal |
| MITC4 · regular · in-plane | 0.1081 | 0.1070722 | 0.95% | pass |
| MITC4 · trapezoidal · out-of-plane | 0.4321 | 0.4162054 | 3.68% | documented failure (#798) |
| MITC4 · trapezoidal · in-plane | 0.1081 | — | — | withheld by the engine (known issue #798, SH-MITC4-DISTORTION) |
| MITC4 · parallelogram · out-of-plane | 0.4321 | 0.4225724 | 2.20% | documented failure (#798) |
| MITC4 · parallelogram · in-plane | 0.1081 | — | — | withheld by the engine (known issue #798, SH-MITC4-DISTORTION) |
| Frame · tip force · 1, 2, 4, 8 elements · uz | −0.0036 m | −0.0036 m | < 1e-10 | pass |
| Frame · tip moment · 4 elements · uz | 0.009 m | 0.009 m | < 1e-10 | pass |
| Frame · tip moment · 4 elements · ry | 0.003 rad | 0.003 rad | < 1e-10 | pass |

- References and results are signed, in global axes; a reversed response fails.
- The 2% limit is a project choice, not the paper's. A shell reference printed to four digits is
  uncertain by ±5e-5; a verdict that would change within that interval is reported as marginal.
- A refusal is not an accuracy pass. The two withheld cases keep their inputs and references in
  the case file and carry `expectedRefusal` (#798, SH-MITC4-DISTORTION) instead of a pinned value.
- `shells macneal_harder::browser_cases` pins every computed case's outcome (`expectedPass`),
  bounds the regular cases at 2%, pins the two distorted out-of-plane values to 1e-8 and requires
  the two distorted in-plane cases to refuse with #798 and SH-MITC4-DISTORTION; `wasm/check.mjs`
  requires WASM to match native values, signs and verdicts, and requires native and WASM both to
  refuse those two cases with the same issue and diagnostic, no value and no pass. An unexpected
  error, or a solve that returns a value for a withheld case, fails verification. The Research
  workflow runs both on engine changes.
- Web unit tests: `web/src/components/research/macneal1985/__tests__/cases.test.ts`. Browser:
  `web/e2e/research-benchmarks.spec.ts`, including phone and tablet sizes.

## Reproduce

```sh
MACNEAL_HARDER_RESULTS=/tmp/macneal-native.json nix develop -c cargo test --locked --manifest-path engine/Cargo.toml --test shells macneal_harder
nix develop -c node research/benchmarks/macneal-harder-1985/wasm/check.mjs /tmp/macneal-native.json
```

## Reviews

Round 1 (Codex, Kimi) and round 2 (Kimi, Codex, Claude), 2026-10-30. Round 2 fixed: signed
comparison, pinned outcomes, the neutral per-category headline, three failure states, units and
quantities, the stated acceptance policy and marginal verdicts, six languages, viewer strings and
keyboard navigation, the reference provenance, and phone/tablet layout.

## Open questions

- Confirm the Table 3 (p. 10) transcription of 0.4321 and 0.1081 against the publisher's scan.
- The remaining problems of the set (curved and twisted beams, plates, shells, thick-walled
  cylinder) and the MITC4 distortion failures and in-plane refusals (#798).
