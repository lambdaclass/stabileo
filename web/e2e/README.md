# End-to-end tests (Playwright)

Configuration and the reasons behind it are in `../playwright.config.ts`. Tests are tagged by suite:

| tag | runs | blocking |
|---|---|---|
| `@smoke` | every PR and the merge queue, 10 shards balanced by duration (`../scripts/e2e-shard.mjs`) | yes |
| `@slow` | the merge queue, or a PR labelled `run-e2e`, 10 shards balanced the same way | yes |
| `@flaky` | every PR and the merge queue, in the `e2e-flaky` job, with `--retries=2` | no |

Locally: `npm run test:e2e:smoke`, `npm run test:e2e:slow`, `npm run test:e2e:flaky`.

## Quarantine: `@flaky`

A test that fails intermittently on CI, and whose cause is not found and fixed on the spot, can be
quarantined with the `@flaky` tag. The blocking smoke and slow runs exclude it
(`--grep-invert @flaky`); the non-blocking `e2e-flaky` job still runs it on every PR, so it stays
visible.

The rule: **a test tagged `@flaky` names its GitHub issue**, labelled `flaky`, in its title, a
comment next to the tag, or an `issue` annotation. The issue says what fails, how often, what was
tried, and what has to be true to lift the quarantine. No issue, no tag.

```ts
test('the thing it checks', {
  tag: '@flaky',
  annotation: { type: 'issue', description: 'https://github.com/lambdaclass/stabileo/issues/607' },
}, async ({ page }) => { /* ... */ });
```

Quarantine is for timing and environment flakes, never for a failing assertion about results: a
test that catches a wrong number is not flaky, the number is wrong. When the issue is fixed, remove
the tag in the same PR and close the issue.

## Shards

Each shard runs whole spec files, chosen from the measured durations in `shard-timings.json`
(smoke) and `shard-timings-slow.json` (slow). A new spec file counts as the median until the
tables are refreshed (`node scripts/e2e-shard.mjs [--suite slow] --update <reports>`, from a CI
run's `playwright-artifacts-*`, `.results/<suite>.json`). Keep spec files under about 10 minutes:
a shard cannot be shorter than its longest file.

The smoke-to-slow migrations in PR #869 use provisional estimates because no fresh
per-suite reports were available. Each migrated file adds its previous whole-file smoke
weight to its slow weight; where that smoke weight was absent or zero, the estimate is
21 seconds (the previous positive smoke-weight median). Mixed files retain their whole-file
smoke weight, using the same fallback if needed; files with no remaining smoke tests get
zero smoke weight. This deliberately overestimates mixed files rather than guessing the
duration of individual tests, and gives all 29 files gaining slow declarations a positive
slow weight, including files missing from the old tables. Replace these estimates in both
tables with a complete set of smoke and slow JSON reports from the next CI run.

## Fast source guards

Run `npm run test:e2e:guards` from `web/`. These Vitest checks scan source only: no
Playwright, preview server, or WASM build is needed. They also run in the normal unit suite.
Failures list every offending file and line.

Every static JSON import anywhere under `e2e/**/*.ts` must use Node's import attribute,
including side-effect imports and multiline declarations:

```ts
import model from './model.json' with { type: 'json' };
```

`assert { type: 'json' }` is not a substitute. Comments and dynamic imports are not static imports.

Smoke tests have a **45,000 ms total test budget**, enforced by the `smoke` Playwright project.
The committed shard timings aggregate whole files and include failures, so they cannot establish
the slowest healthy individual test; 45 seconds is the fallback until healthy per-test reports
are available. Slow, flaky and untagged tests retain the `chromium` project's 60-second default
and their existing explicit longer budgets. The projects partition the tests without duplication.
Use the npm suite commands or `--grep @smoke`; `--project chromium` now excludes ordinary smoke.

In a spec containing smoke tests, test-budget overrides (including `test.info().setTimeout`
and `test.describe.configure`) must use positive literal milliseconds no greater than 45,000.
Parenthesized literals are accepted; arithmetic and identifiers are rejected because the source
guard cannot establish their values. `test.slow()` is forbidden outside explicit `@slow`/`@flaky`
scopes. A `// slow-ok:` comment never exempts a test-budget override or `test.slow()`.

Individual numeric wait options above 45,000 ms (or zero, which disables the wait timeout)
may carry `// slow-ok: <real reason>` on the same line. Shared helpers are checked too.
A reason on a preceding line or in a string does not exempt the wait. Scope tags come only
from test/suite titles and their actual `tag` property; comments and annotation text do not
count. Keep slow tags out of smoke-tagged parent suites: give the individual tests their own
suite tags when splitting a mixed group.

Ordinary startup/UI waits should fit inside the smoke budget. Long journeys, full model sweeps,
live design/detailing and large exports belong in `@slow`. A shared helper may document why its
slow callers need a longer wait; that exception does not increase a smoke caller's total budget.
Do not raise the cap to accommodate a failing test.
