# Performance checks

Two checks keep the site from getting slower without anyone deciding it should (#734). The audit
that motivated them is [AUDIT-2026-10.md](AUDIT-2026-10.md).

## Route sizes (every change to the web app)

CI's route byte budget (`web/scripts/check-research-route-size.mjs`) builds the pull request and
its base and fails when the landing or an `/app/*` route grows by more than its budget in
`web/scripts/product-route-growth-budgets.json`. It is the per-change gate; this directory does not
add a second one.

## Lighthouse (daily, against production)

`web/scripts/perf-lighthouse.mjs`, run by `.github/workflows/performance.yml` every day, on demand
(`gh workflow run performance.yml`), and on a pull request that changes the check. It runs
Lighthouse 13.5.0 (pinned in `web/lighthouse/`, outside the app's dependencies) with Playwright's Chromium
on a GitHub-hosted runner, five times per URL and per preset (mobile and desktop), and compares the
median with `web/perf-lighthouse.json`. A median more than the margin from its baseline in either
direction fails, a URL or category with no baseline fails, and so does a Lighthouse run that ends
without a score. A failed scheduled run opens an issue
(`verification-alert.yml`).

It is not a merge gate: it measures what is deployed (about seven minutes per preset), so it
catches a regression the day it ships rather than before.

| Command | What it does |
|---|---|
| `make perf.lighthouse.deps` | install the pinned Lighthouse |
| `BASE=https://stabileo.com PRESET=mobile make perf.lighthouse` | measure and check |
| `ARGS=--write ... make perf.lighthouse` | raise the baseline where a median is higher (after a `RAISE`); never lowers it, and still fails on a regression |
| `ARGS=--no-check ... make perf.lighthouse` | measure only (another site, a local preview) |

Scores from another machine are not comparable with the baseline: raise it from the workflow's
numbers (its artifact has every report), not from a laptop.

### The margins

Measured on 2026-11-01 and 2026-11-02, three runs of the workflow (five Lighthouse runs per URL
and preset each, 150 reports in all):

- Single runs of the performance score have outliers: 78 and 88 among 98s on `/es/` mobile.
  The median of five removed both.
- The medians of the three runs were never more than 2 points apart (mobile `/app/basic` 60, 59,
  58; desktop 60, 62, 61). The performance margin is 4 points, twice that.
- Accessibility, best practices and SEO gave the same median in all three runs on every URL and
  preset. Their margin is 0: any change is a change to the site.

The baseline is the lowest median of the three runs. A median more than the margin below it fails
(`FAIL`, a regression); one more than the margin above it fails too (`RAISE`), so an improvement is
recorded with `--write` (which only raises) instead of leaving room to slide back unnoticed.
