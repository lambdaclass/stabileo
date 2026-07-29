# Playwright screenshot baselines

Path template (see `playwright.config.ts`):
`e2e/__screenshots__/{platform}/{name}.png` — Playwright resolves `{platform}` from
`process.platform`, so Linux CI reads `linux/` and macOS reads `darwin/`.

## Status

| Platform | `overlay-legend.png` | `batch-dialog.png` | Notes |
|---|---|---|---|
| `linux/`  | ✅ 699 × 28  | ✅ 900 × 386 | **Authoritative — this is what CI compares against.** Generated on `ubuntu-latest` with the pinned Chromium + SwiftShader. |
| `darwin/` | ✅ 696 × 34  | ✅ 900 × 392 | Local macOS development only. CI never reads these. |

The two platforms produce different image heights because font rasterisation differs;
that is exactly why a Darwin image may never be renamed into `linux/`.

## How the Linux baselines were produced

They could not be generated on the authoring machine (macOS arm64, no container or VM
runtime available). Instead the CI `e2e` job generated them:

1. The `run-e2e` label was added to the pull request, which enables the slow suite and
   the visual-baseline step.
2. That step runs `npx playwright test --grep "visual baselines" --update-snapshots`,
   writing `e2e/__screenshots__/linux/`.
3. The step uploads them as the `linux-screenshot-baselines` artifact.
4. The artifact was downloaded, both images were inspected, and they were committed
   here unmodified.

To regenerate after an intentional UI change, either add the `run-e2e` label and let CI
rewrite them, or reproduce locally with the pinned container:

```sh
docker run --rm -it -v "$PWD":/w -w /w/web \
  mcr.microsoft.com/playwright:v1.60.0-jammy \
  sh -c 'npm ci && VITE_E2E=1 npm run build && \
         npx playwright test --grep "visual baselines" --update-snapshots'
```

## Blocking policy

Both comparisons use `expect.soft(...)` and the CI step is `continue-on-error`, so a
pixel mismatch is **informational and never fails the job** on this first landing.
Promote them to blocking once they have proven stable across a few runs.

The DOM, store-hook and functional browser assertions are and remain **blocking**.
