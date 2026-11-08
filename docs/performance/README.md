# Performance checks

Two checks keep the site from getting slower without anyone deciding it should (#734). The audit
that motivated them is [AUDIT-2026-10.md](AUDIT-2026-10.md).

## Route sizes (every change to the web app)

CI's route-size job (`web/scripts/check-research-route-size.mjs`) builds the pull request and main
and reports how much the landing and each `/app/*` route grew; size alone never fails a PR. The
weekly Route size workflow (`.github/workflows/route-size.yml`, also run by hand or with
`make check.web.route-size`) measures main against the absolute ceilings in
`web/scripts/route-size-ceilings.json` and opens or updates a `route-size` issue when a route is
over, to be fixed then.

## First paint on /app (every change to the web app)

An `/app/*` address is served the prerendered landing, which `main.ts` removes before the
application (about 2.4 MB of JavaScript) downloads. An inline script in `index.html` marks an `/app`
address before the first paint, so the page shows the brand mark on the application's ground until
App mounts; without it nothing paints until App mounts, and simulated mobile first
contentful paint moves from about 2 s to about 9 s (2026-11-06, run 42176395212: mobile `/app/basic`
and `/app/pro` performance 26 against a baseline of 46). The smoke spec `e2e/app-boot.spec.ts`
holds the App chunk and fails unless the mark, and a first contentful paint, appear first.

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
  58; desktop 60, 62, 61). On 2026-11-04 they were up to 4 apart (desktop `/en/` 94, 98, 98),
  so a baseline at the midpoint of the observed range is never more than 2 from a run. The
  performance margin is 4 points, twice that.
- Accessibility, best practices and SEO gave the same median in all three runs on every URL and
  preset. Their margin is 0: any change is a change to the site.

The baseline is the midpoint of the lowest and highest of the three runs' medians, rounded down (not their median). A median more than the margin below it fails
(`FAIL`, a regression); one more than the margin above it fails too (`RAISE`), so an improvement is
recorded with `--write` (which only raises) instead of leaving room to slide back unnoticed.

### Re-baseline of 2026-11-04

Three runs of the workflow against production (run 41880093953, attempts 1 to 3) gave `/app/basic`
and `/app/pro` performance medians of 33 to 40, against 58 to 60 on 2026-11-02. The bytes those
pages download fell (7.45 to 7.36 MB) and their total blocking time did not change (1.7 to 2.3 s
desktop, 7.4 to 9.1 s mobile, in both); what moved is the largest contentful paint. On 2026-11-02 it
was the first paint (about 2.2 s on mobile); now it is the application header's project-name
field, which is larger than anything painted before the application mounts, so LCP now measures
when the editor appears (about 23 s on simulated mobile). The new number is the honest one for an
application page. The first of the three runs also had a slower server response (206 against
123 ms) and gave public-page medians up to 4 points lower than the other two. Each baseline is the
midpoint of its lowest and highest median, so every observed median is within 2 points of it.

### Re-baseline of 2026-11-08

From 2026-11-06, both presets failed every day on `RAISE` alone. Accessibility went up one point on
mobile `/app/basic` and `/app/pro` (73 to 74) and on desktop `/app/basic` (75 to 76), `/app/pro`
(77 to 78) and, from 2026-11-07, the blog page (93 to 94). Each of these values was identical in
every run since it appeared (runs 42176395212, 42348262635 and 42427965763). Desktop performance
medians in those three runs were 96, 99, 99 for the blog page, 42, 43, 45 for `/app/basic` and 39, 42,
42 for `/app/pro`. Their baselines are now 97, 43 and 40, the midpoints. No baseline went down, and
no margin changed.

### The mobile application pages

On simulated mobile, which element is the largest contentful paint on `/app/basic` and `/app/pro`
varies between page loads. In run 41889894395, `/app/pro` scored 59 in three of its five loads
(LCP about 2.1 s, the first paint) and 34 in the other two (LCP about 22.9 s, the header's
project-name field), so its median can land on either value; on 2026-11-04 the three runs had
given 33 to 35. Their mobile performance baseline is 46, with a margin of 13 written in their own
entry (`"margin": { "performance": 13 }`, which overrides the top-level margin for that URL and
preset only), so both modes pass and a median below 33 still fails. Desktop and the other
categories keep the top-level margins. `--write` leaves a category with its own margin alone (it would set it to
whichever mode the run happened to hit), so these are raised by hand.
