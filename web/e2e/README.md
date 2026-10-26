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
