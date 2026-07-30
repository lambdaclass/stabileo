# PR17 characterization change after the PR #78 review correction

Audit of why five assertions in `web/src/lib/engine/detailing/__tests__/design-feedback-loop.test.ts`
moved when Diego's PR #78 review commit `e20707a9` was propagated into PR17, and of what the
test should assert instead.

**Verdict: no defect.** The reduction is a legitimate early stop at the 0,95 design target,
driven by a corrected shear capacity. Nothing became unreachable. **No solver, Rust, Cargo or
WASM code is involved anywhere in this audit.**

## 1. Root cause

`e20707a9` fixed three verifier defects in `station-design-forces.ts`:

| # | Defect | Effect |
|---|---|---|
| 1 | Column uniaxial P-M analysed about the wrong axis (`capAxis` followed the moment name, not the flex-rotated section) | false pass at util 0.68 vs true 1.51 on 0.6×0.3 with 8⌀20 |
| 2 | Opposite-sign demand silently unchecked — span hogging and support sagging filtered out of every region | coverage regression vs the pre-regional sweep |
| 3 | **Shear capacity received axial force in solver sign (`+` = tension) while expecting compression-positive** | **compression weakened, tension strengthened** |

Defect 3 is the operative one. Members 5 and 6 are governed by shear at their support and are in
compression, so before the fix their φVn was **under-credited** and they reported
`worstUtilization = 0.993`. With the sign corrected they report **0.922** — a more favourable,
and correct, value.

Because 0.922 ≤ `DESIGN_TARGET_UTILIZATION` (0.95), the repair loop now stops escalating one
arrangement earlier, and every operational count downstream falls with it.

### Why this was not caught in PR15

`e20707a9`'s own message records *"Full web suite 2940 passed"*. That is the suite as it exists
at PR15 — and `design-feedback-loop.test.ts` does not exist there. It arrives at PR17 via
`a7edb5ee` and `0353d135`. The fix and the test never met until this propagation. Confirmed:
running the full suite at the repaired PR15 head still reports exactly **2940 passed**.

## 2. The stopping condition

`web/src/lib/engine/design/final-geometry-feedback.ts`, inside the candidate loop:

```ts
if (verdict.worstUtilization <= DESIGN_TARGET_UTILIZATION + UTIL_EPSILON) break;
```

with `DESIGN_TARGET_UTILIZATION = 0.95` and `UTIL_EPSILON = 1e-6` (`design/outcome.ts`). Its own
comment states the intent: *"this only stops the escalation early, it never accepts something
over 1,00."*

| | member 5 arrangement 2 util | `≤ 0.95 + 1e-6`? | escalation |
|---|---|---|---|
| before `e20707a9` | 0.993 | **no** | continues → arrangements 3, 4 |
| after `e20707a9` | 0.922 | **yes** | **breaks** |

That single comparison is the whole mechanism. It is a stopping condition on the **consumer** of
the generator, not a limit on the generator.

## 3. Before / after trace

Measured on the fixture `templates/fixtures/rc-design-qa-8.json` via the real
solve → design → detail chain.

| Assertion | Before | After |
|---|---|---|
| `worstUtilization` (members 5/6) | 0.993 | **0.922** |
| `worstUtilization` (members 7/8) | 0.883 | 0.883 |
| `candidatesConsidered` (aggregate) | 12 | **8** |
| `verifierCalls` (aggregate) | 7 | **5** |
| `memoHits` (aggregate) | 8 | **7** |
| `perMember` verifier calls | `[4, 0, 1, 0]` | **`[2, 0, 1, 0]`** |
| `truncated` / `repeatedStates` / `nonMonotonicSkipped` | false / 0 / 0 | false / 0 / 0 |

Per-member detail after the correction:

| Member | candidates | verifierCalls | memoHits | util | meets 0,95 |
|---|---|---|---|---|---|
| 5 | 2 | **2** | 0 | 0.922 | yes |
| 6 | 2 | **0** | 2 | 0.922 | yes |
| 7 | 2 | **1** | 1 | 0.883 | yes |
| 8 | 2 | **0** | 2 | 0.883 | yes |

Aggregate vs per-member: the aggregate is a **superset**, not a sum. The loop verifies each
member's *current* arrangement at final geometry before repairing it (`design-feedback-loop.ts`,
memo lookup then `adapter.verify`), contributing 2 verifier calls and 2 memo hits of its own on
top of the per-repair 3 and 5. So `verifierCalls 5 = 2 + 3` and `memoHits 7 = 2 + 5`.
`memoHits ≠ candidatesConsidered − verifierCalls`; asserting that identity would assert a
relationship the loop does not have.

## 4. Candidate sequence — forced continuation

Driving `createBeamCandidateGenerator(ctx)` for member 5 directly, feeding back real adapter
verdicts and **never** stopping at the design target:

| pull | genIndex | util | passes ≤1.00 | meets ≤0.95 |
|---|---|---|---|---|
| 1 | 0 | 1.0800 | **no** | no |
| 2 | 1 | **0.9210** | yes | **yes ← production breaks here** |
| 3 | 2 | 0.8990 | yes | yes |
| 4 | 3 | 0.8720 | yes | yes |
| 5 | 4 | 0.8410 | yes | yes |
| 6 | 5 | 0.7900 | yes | yes |
| 7 | 6 | 0.7370 | yes | yes |
| 8 | 7 | 0.6720 | yes | yes |
| 9 | 8 | 0.5850 | yes | yes |
| 10 | 9 | 0.4600 | yes | yes |
| 11 | 10 | 0.7840 | yes | yes |
| 12 | 11 | 0.7790 | yes | yes |

**12 distinct arrangements, 12 distinct rebar hashes.** The loop consumes 2. Utilisation
descends monotonically through pull 10, then rises slightly as the generator moves to a
different knob — normal envelope behaviour, not a fault.

(The 0.9210 here vs 0.922 in the loop is expected: this trace verifies at the nominal context,
the loop verifies at final geometry with detailing losses. Same arrangement, same mechanism.)

## 5. Conclusions

| # | Question | Answer |
|---|---|---|
| 1 | Did arrangements 3–4 disappear because member 5 satisfied the corrected demand at arrangement 2? | **Yes.** util 0.921 ≤ 0.95 at genIndex 1 triggers the documented break |
| 2 | Are arrangements 3–4 still generatable if escalation is forced? | **Yes** — 12 distinct arrangements reachable, genIndex 2 and 3 among them at 0.8990 and 0.8720 |
| 3 | Did the new opposite-sign seeds remove, replace, or merely add candidate demands? | **Merely added, and widened.** `MuSpanHog`/`MuStartSag`/`MuEndSag` are new fields; existing assignments are untouched (`else` branches added). Top-steel knobs now seed on `max(MuStart, MuSpanHog)`, so availability is a **superset**. The `want` mapping gained new `else if` branches only |
| 4 | Is any valid candidate now unreachable? | **No.** 12 reachable vs 2 consumed |
| 5 | Is any branch pruned for a reason unrelated to corrected utilisation? | **No.** `repeatedStates = 0`, `nonMonotonicSkipped = 0`, `rejectedSkipped` not implicated. The only stop is the 0,95 break |
| 6 | Are the reduced verifier calls and memo hits entirely explained by earlier legitimate convergence? | **Yes.** Member 5 does 2 instead of 4; the pair zeros are unchanged; memo hits fall because there are fewer enumerated candidates to hit the memo with |
| 7 | Deterministic? | **Yes** — identical across three consecutive full runs, per-member and aggregate |

## 6. Assertion classification and final strategy

The old test asserted five operational magnitudes as exact identities. Four of them are
implementation detail that legitimately moves with the verifier. Replaced as follows.

| Old assertion | Classification | Replacement |
|---|---|---|
| `worstUtilization` 0.993 → **0.922** | **exact deterministic contract** — it is the certificate value an engineer reads | kept at 3 dp, with the shear-sign provenance in a comment, **plus** the independent hard bound `≤ 1.00` |
| `candidatesConsidered === 12` | **upper performance bound** — the exact count is incidental; unbounded growth is not | `> 0` and `≤ 12` (the pre-correction measurement, so the corrected search may never do *more* work) |
| `memoHits >= 8` | **lower memoisation bound, restated semantically** | `memoHits > 0` **and** at least one repair reports its own memo hit — reuse on both paths |
| `verifierCalls === 7` | **semantic relationship** — a magic total hides which work is attributed | `verifierCalls ≥ Σ perMember`, with the superset relationship documented |
| `perMember === [4,0,1,0]` | **semantic** — the zeros were always the real contract | first of each identical pair `> 0`; **second of each pair `=== 0`**; length 4 |
| — | **new: strengthening** | the early stop *is* the design target (every certificate `≤ 0.95`) **and** ≥ 4 distinct arrangements stay reachable when the generator is pulled past it |

Preserved untouched as physical/code contracts: `worstUtilization ≤ 1.00`; the `≤ 0.95` target on
the layer-moved pair; `truncated === false`; `repeatedStates === 0`;
`nonMonotonicSkipped === 0`; the Table 9.7.6.2.2 governing-check assertions; locked-reinforcement
refusal; determinism; certificate/geometry identity.

The suite is **stronger** after this change, not weaker: it gained a reachability contract that
would catch a genuine envelope truncation, which the old magic numbers could not distinguish
from an early stop.

## 7. Commands and results

```
# ownership
git log --diff-filter=A -- web/src/lib/engine/design/__tests__/review-fixes.test.ts
  -> e20707a9  (== PR15 head)
git log --diff-filter=A -- web/src/lib/engine/detailing/__tests__/design-feedback-loop.test.ts
  -> a7edb5ee  (PR17)

# type diagnostic, at PR15 head
npx tsc --noEmit | grep review-fixes
  -> review-fixes.test.ts(204,5): error TS2322: Type 'number | undefined' is not assignable to 'number'
  -> after the control-flow guard: gone; raw total 457 -> 456

# gates
PR15  npm test   -> 2940 passed, 12 skipped ; build green
PR16  npm test   -> 3331 passed, 12 skipped
PR17  design-feedback-loop.test.ts -> 31 passed
PR17  detailing + design + store + rc-design-gates -> 1190 passed
```

`scripts/typecheck.mjs` and `typecheck-baseline.json` exist **only on PR18**, so the 490/490
baseline check is performed there. PR15/16/17 carry no typecheck gate, and **the baseline is not
raised** by this work.
