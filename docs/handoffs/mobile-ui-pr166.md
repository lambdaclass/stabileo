# Handoff — PR #166, mobile UI for Basic

Branch `basic/mobile-ui`, draft, targets `basic/demos` (#163).
Written to be picked up cold: everything below is measured, not remembered.

---

## 1. Where this stands

Three commits landed, each verified at 375×667 and 430×932 in Chromium with
touch enabled:

| commit | what it does | evidence |
|---|---|---|
| `72f5c9e0` | `zoom-to-fit` waits for the canvas backing store to match its CSS box | defensive; see §4 |
| `16f8f2ef` | header touch targets ≥ 44 px; language selector moves to Settings | 14 undersized controls → 0 |
| `225f0ca1` | right panel becomes a bottom sheet on phones | 226 px of model stays visible |

Nothing is merged. CI has not been run on this branch.

---

## 2. The problem this PR exists to solve

**Desktop Basic and mobile Basic are two different applications.**

- Desktop mounts `Ribbon` + `BasicPanel` (`App.svelte`, gated on
  `uiStore.appMode === 'basico' && !uiStore.isMobile`).
- Mobile mounts `Toolbar` (the old left panel) inside a drawer, plus
  `FloatingTools` — gated on `uiStore.appMode === 'basico' && uiStore.isMobile`.

Everything built in the last several PRs targets the ribbon: the pointer mode
on the model, the Selection panel, the results panel with its selectors, the
colour-scale legend switch, the tutorials menu. On a phone those are reached
through a different set of controls, or not at all. Any new work on Basic
currently has to be done twice or it silently only ships to desktop.

Measured baseline, before this branch:

```
                       375×667      430×932
ribbon                 absent       absent
left toolbar           drawer only  drawer only
floating tool bar      present      present
horizontal overflow    none         none
canvas share of screen 85 %         89 %
controls under 44 px   14           14
```

---

## 3. Decision already taken

**Optimise for 375 px** (iPhone SE / mini). What fits there fits a larger
handset; the reverse is how the header ended up with a 23×22 px button. The
user was asked twice which handset and did not specify, so this was chosen on
that reasoning — revisit if they say otherwise.

---

## 4. Open question that must be answered first

**The model does not appear to render on the phone canvas.**

In every mobile screenshot taken during this work the canvas shows the grid,
the axes gizmo and one clipped load label — but no members, on a model that
`window.__stabileo.elementIds()` reports as having 3.

Twice I attributed this to my own measurement and both times that explanation
is now doubtful:

- `window.__stabileoActions.loadExample()` calls `modelStore.loadExample()`
  **without** dispatching `stabileo-zoom-to-fit`, so a model loaded that way is
  never framed. That is real and explains an off-screen model.
- But the load label rendered at the right edge, which means the canvas is
  drawing *something* — so "nothing is framed" and "nothing is drawn" are
  different claims and only the first is established.

**Do this before any layout work.** Load an example through the UI
(menu → Ejemplos 2D → tap one) at 375 px and look at the canvas. If members
render, the earlier readings were an artefact of the hook and commit
`72f5c9e0` is the whole of it. If they do not, that is the first bug and
everything else waits.

Reproduce:

```bash
cd web
NODE_OPTIONS= VITE_E2E=1 npm run build
NODE_OPTIONS= npx vite preview --port 4258 --strictPort &
# then drive Chromium at 375×667, isMobile: true, hasTouch: true
```

---

## 5. Work remaining, in order

### 5.1 One shell instead of two — the substance of this PR

Make mobile Basic the ribbon adapted, not a parallel interface. Suggested
shape, not yet validated:

- Ribbon collapses to a horizontally scrollable single row of icon commands,
  labels dropped below 768 px. Group labels (VISTA, DATOS, DIBUJAR…) become
  separators rather than captions.
- The quick row (`rb-quick`: file, save, undo, redo, project) folds into an
  overflow button, since those are not per-gesture actions.
- `FloatingTools` and the `Toolbar` drawer are then dead weight on phones and
  should be removed for Basic — check `uiStore.appMode === 'educativo' &&
  eduStore.authoring` still needs `FloatingTools`, it does today.
- Anything that does not fit goes in a sheet, never in a second toolbar.

Files: `src/App.svelte` (mount gates around lines 845–1080),
`src/components/ribbon/Ribbon.svelte`, `src/components/FloatingTools.svelte`.

### 5.2 Remaining touch targets

Header is done. The rest of the 14 were elsewhere in the shell — re-measure
after 5.1, since the ribbon migration changes which controls exist. The probe
used:

```js
[...document.querySelectorAll('button, select, input')]
  .map(e => { const r = e.getBoundingClientRect(); return {t: e.textContent?.trim().slice(0,14), w: r.width, h: r.height}; })
  .filter(x => x.w > 0 && x.h > 0 && (x.w < 44 || x.h < 44))
```

### 5.3 The bottom sheet needs a grab handle and a drag

It is fixed at 58 vh. It should be draggable between a peek height and full,
because reading a results table wants more than half the screen and reading a
diagram wants less. Currently there is no affordance saying it can be resized
— because it cannot.

### 5.4 The tutorials on a phone

Eight walkthroughs point at ribbon commands via `data-testid="rb-cmd-*"`
(`src/lib/tour/demo-helpers.ts`, `ANCHORS`). If 5.1 changes those anchors or
puts commands behind an overflow, every walkthrough breaks — and the audit
script below is how to find out in one run rather than eight.

### 5.5 PRO

After Basic, as agreed. Not started, not scoped.

---

## 6. How to verify

**The demo audit** — walks all eight walkthroughs and checks that every step
points at something visible, that steps requiring an action can reach it, and
that a card claiming a result switched to it:

```
/private/tmp/claude-501/-Users-bautistachesta-Claude/483f0ef8-8bd9-4e17-8146-6008da7ceb15/scratchpad/audit-demos.mjs
```

Copy it into `web/` before running — it imports `playwright` and needs the
package to resolve. Expects the preview on `:4258`. Prints `sin problemas` or
a list.

**Suites**

```bash
cd web
NODE_OPTIONS= npm run typecheck                     # must stay at baseline 479
NODE_OPTIONS= npm run test                          # two vitest passes
NODE_OPTIONS= npx playwright test e2e/basic-demos.spec.ts
```

Known: one test in `basic-demos.spec.ts` is declared with two retries and
reports flaky roughly one run in twenty. It drives a canvas whose layout moves
between steps; the walkthrough itself is deterministic.

Known and **not from this branch**: `chs-shear-agreement.test.ts` fails on
`main` (circular tube shear, Diego's #157). Verified by stashing.

---

## 7. Project rules that apply

- **Never touch the solver** — `engine/src/solver/`, `engine/src/element/`.
  If a fix seems to need it, re-audit instead.
- **Every commit is Bauti's**, `syngoviano@gmail.com`, G-signed. No
  co-authorship, no tool attribution.
- Do not touch ports 4000 or 4002 (in use). This work uses 4258.
- Temporary scripts stay outside the repository.
- The CI e2e job runs `@smoke` only. A spec without that tag can rot unseen —
  that is how a pointer regression survived several commits.

---

## 8. Things learned here that will bite again

- `openBasicPanel(panel)` **toggles by default**. Two consecutive calls close
  it. Pass `{ toggle: false }` when the intent is "open".
- A tour step's `waitFor` runs inside an effect and must read **store state**.
  Reading `Map.size` or the DOM produces a condition that is right once and
  never re-evaluated. Three separate hangs came from this; the auto-advance
  now polls at 300 ms, which removes the class.
- `getBoundingClientRect()` on a scrolled panel returns the whole content
  rectangle. The tour highlight is clamped to the viewport in
  `tour.svelte.ts` for this reason.
- The e2e hook `loadExample` does not frame the model. Use the UI path when
  what you are measuring is what a user sees.
