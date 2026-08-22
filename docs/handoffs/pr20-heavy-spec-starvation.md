# `rebar-3d.spec.ts` starvation — the diagnosis, and the fix that was made

**Status:** FIXED. The diagnosis below is kept because the fix only makes sense against it, and
because one of its conclusions turned out to be wrong in a way worth recording.

## The symptom

Run the file whole and one test fails; run that test alone and it passes.

```
$ npx playwright test e2e/rebar-3d.spec.ts e2e/rebar-workspace-open.spec.ts \
    e2e/rebar-workspace-focus.spec.ts        # E2E_PORT=4293
  1 failed
    rebar-3d.spec.ts:319 › a whole building reports columns, beams, slabs and walls with their steel
  28 passed (8.6m)

$ npx playwright test e2e/rebar-3d.spec.ts --grep "a whole building reports columns"
  ✓ 1 passed (36.5s)
```

## What it is NOT

**Not a missing timeout.** All four heavy tests already declare a budget — lines 324, 362, 383
and 396 each carry their own `test.setTimeout`. Raising them further would hide the problem, and
is explicitly out of bounds.

**Not the fix from the last pass.** The `--st-*` token aliasing in `RebarWorkspace` changes no
geometry, no store and no timing; the same starvation is recorded in
`pr20-ui-and-workflow-plan.md` §5.4, written before any of it.

## What it is

Four tests in this file each pay a **complete** 7-storey setup: load a 203-member model, solve
it, design every member, coordinate the detailing, run the floor design, and build a scene of
about 21 000 tubes and 8 000 conflict markers. `workers: 1`, so they run one after another in the
same process, and the last ones run on a machine that has been at full tilt for minutes.

| Line | Test | Needs the building for |
|---|---|---|
| 324 | a whole building reports columns, beams, slabs and walls | **the whole journey** — this is the one to keep intact |
| 362 | turning columns off removes their STEEL as well as their concrete | a model with column steel |
| 383 | a family the model does not contain says so on its switch | a model missing at least one family |
| 396 | closed ties, crossties and joint ties are counted apart | a model with all three tie kinds |

Only line 324 is about the journey. The other three are **observers**: they open a prepared
workspace and assert what the rail reports.

### What the diagnosis got wrong, measured afterwards

It assumed the setup was expensive in itself. It is not: on an idle machine the whole chain —
load, solve, `designAll`, detailing, floor design — is about **17 seconds**. Four of those is a
minute, not the eight the file takes.

What makes it starvation is that ONE of those steps does not degrade gently. `fixtures.ts`
already records the measurement that matters: on a run where the cost spec had just spent ten
minutes on this machine, a 7-storey solve exceeded **four minutes**, with the worker pool up and
no fallback to the sequential solver. So the operation to remove from the observers was never
"the setup", it was **the solve** — and the fix below removes exactly it, because a restore is
explicitly not a solve (`pro-project-files.spec.ts` C asserts that opening a project does not
move the solve counter).

## The fix

`e2e/prepared-building.ts`. The chain runs ONCE per worker, in a context of its own. Each
observer gets a NEW PAGE in that context, the app finds its own autosave, and the test presses
Restaurar.

- **Isolation is real.** A new page is a new realm: every store, every switch, the selection, the
  camera and the WebGL context are fresh, exactly as they are for a page Playwright hands out.
  The trap in the original plan — that "reuse" would mean sharing a page, and that
  `rebar-workspace.svelte.ts` deliberately keeps the layer switches across a close/reopen — does
  not apply, because nothing is shared except storage.
- **Produced by the application.** `requestAutosave` writes it and the restore banner reads it.
  No fixture writes project data.
- **Guarded.** The fixture compares the stored fingerprint against the prepared one before every
  restore, so a future test that writes over the slot fails loudly instead of leaving every
  measurement about a different building. And `rebar-3d.spec.ts` carries a test that asserts the
  restored scene equals the live one — the family tally, the piece kinds, and the mesh census read
  off `mesh.visible` — so a restore that lost anything is a failure rather than a smaller number
  nobody notices.

### The transport that did not work, and why it matters beyond the tests

The plan's preferred shape was to serialise the project through the production save path and load
it per test. That was tried first and appeared to fail — and the diagnosis was WRONG, which is
recorded here because the wrong version of it was committed:

- the `.ded` download was driven through `pro-project-save`, a control PR20 had already removed
  from desktop PRO, so Playwright waited on a button that does not exist and the download timeout
  racing it got the blame. Through `pr-save`, which does exist, the same project saves in 2 s;
- `context.storageState({ indexedDB: true })` genuinely does not return on a payload this size,
  which is a limit of that Playwright API and not of the app.

So the transport chosen here is not a workaround for a broken save. It is chosen because it is
faster and because it never moves fifty megabytes through the test process: the autosave keeps the
project an object inside the browser. `e2e/ded-roundtrip.spec.ts` now covers the file itself.

The measurement did leave one real improvement behind: `serializeProject` was pretty-printing, and
the 7-storey `.ded` went from 110,3 MB to 48,0 MB when it stopped.

### One regression this introduced, and what it cost

The prepared setup opens the viewer from `cmd-open-3d` on the command row, and did not open the
detailing disclosure. `rebar-viewport-cost.spec.ts` closes the workspace and reopens it from
`doc-3d`, which lives INSIDE that disclosure — so Playwright waited on an element that exists, is
enabled, and will never be visible, and spent the test's entire fifteen-minute budget doing it.
`openPreparedWorkspace` now leaves the panel open, as the setup it replaces did. Recorded because
the failure reads as a hang and is not one.

## Measured, after

| | before | after |
|---|---|---|
| `rebar-3d.spec.ts`, whole file | 1 failed of 29 across three files, 8.6 min | **24 passed, 3.1 min** |
| the journey test inside the whole file | failed | 35.4 s |
| each of the three observers | a full setup each | 6.6–9.4 s |
| `rebar-viewport-cost.spec.ts`, whole file | 12.3 min (plan §5.4) | **10 passed, 6.6 min** |

The "before" column for the first two rows is the measurement at the top of this document, taken
on the same machine before the change; it was not re-run afterwards.

## Still true

`E2E_PORT=4293`, one Playwright instance, no widened budgets, no force clicks, no disabled specs.
The three observers' `test.setTimeout(240_000)` overrides are now far above what they need and
could be lowered; they are left alone in this pass rather than tuned on one run's numbers.
