# Performance ratchets

Two checks keep the site from getting slower without anyone deciding it should (#734). Both
compare against a committed baseline of measured numbers, and both only tighten: a better number
becomes the new baseline, a worse one fails until someone makes it better or records the growth
on purpose in a reviewed pull request. The audit that motivated them is
[AUDIT-2026-10.md](AUDIT-2026-10.md).

## Route sizes (every change to the web app)

`web/scripts/perf-budget.mjs`, run by `make test.web.build` right after `npm run build`, so CI's
Web Build job fails on it. For each route it adds up the `gzip -9` size of what the browser must
download before the route is usable:

- everything the route's HTML loads through `<script>` and `<link rel=stylesheet|modulepreload|preload|icon>`
  (the preloaded fonts included);
- the static import closure of those scripts, with their CSS;
- for `/app/basic`, the application loader (`src/load-app.ts`), what it imports and their static
  closure: the application chunk itself.

Dynamic imports are not counted: moving code behind one lowers the number, which is the point.
Files a stylesheet or `new URL()` names (KaTeX's fonts, images) are not counted either, because
the browser fetches them only when they are used. The bundle graph comes from a Vite plugin
(`web/scripts/perf-bundle-graph.mjs`) that writes `web/.perf/bundle-graph.json` beside `dist`, never
into it; the check refuses a graph from a different build directory or one naming a file that is
not in `dist`.

The engine WASM is reported but not gated: its bytes embed the commit it was built from and the
absolute paths of the machine that built it (panic locations of its dependencies), so a pull
request built on a GitHub runner and the same commit built on the self-hosted runner in the merge
queue differ in size. Gating it needs a reproducible WASM build first (#1072).

`web/perf-budget.json` holds the baseline. The check fails when a route is more than
`margin_gzip_bytes` larger than it (it grew) or smaller (it shrank and the baseline must follow):

| Command | What it does |
|---|---|
| `make perf.budget` | check `web/dist` (after `npm run build`) |
| `make perf.budget.write` | lower the baseline where a route shrank; refuses to raise it |
| `make perf.budget.accept` | record every measured size, growth included; say why in the pull request |

The numbers depend on the real engine glue, so build with `make wasm` first. A failing CI run
prints the measured sizes in the job summary.

### The margin

Measured on 2026-11-01: two builds of the same commit gave byte-identical JavaScript and CSS.
Three builds that differed only in the embedded build commit (`GITHUB_SHA`, 12 hexadecimal
characters in `__STABILEO_COMMIT__`) gave identical raw sizes and gzip sizes within 4 bytes of each
other for the landing and 10 bytes for `/app/basic`. The margin is 64 bytes, six times that spread;
anything larger is a real change.

The prerendered HTML is not counted: the prerender snapshots the landing's animated hero and
scroll indicator mid-animation, so two prerenders of the same commit differ by up to 250 bytes of
SVG coordinates. The files it loads were identical in both.

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
catches a regression the day it ships rather than before. The route size gate is the per-change
gate.

| Command | What it does |
|---|---|
| `make perf.lighthouse.deps` | install the pinned Lighthouse |
| `BASE=https://stabileo.com PRESET=mobile make perf.lighthouse` | measure and check |
| `ARGS=--write ... make perf.lighthouse` | raise the baseline where a median is higher (after a `RAISE`); never lowers it |
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
