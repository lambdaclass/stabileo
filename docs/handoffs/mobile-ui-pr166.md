# Handoff — PR #166, mobile UI for Basic

Branch `basic/mobile-ui`, draft, targets `basic/demos` (#163).
Written to be picked up cold: everything below is measured, not remembered.

---

## 1. Where this stands

Four commits landed, each verified at 375×667 and 430×932 in Chromium with
touch enabled:

| commit | what it does | evidence |
|---|---|---|
| `72f5c9e0` | `zoom-to-fit` waits for the canvas backing store to match its CSS box | defensive; see §4 |
| `16f8f2ef` | header touch targets ≥ 44 px; language selector moves to Settings | 14 undersized controls → 0 |
| `225f0ca1` | right panel becomes a bottom sheet on phones | 226 px of model stays visible |
| `8dfaa071` | one Basic instead of two: the ribbon at every width (§5.1) | see the table in §5.1 |

Nothing is merged. CI has not been run on this branch.

---

## 2. The problem this PR exists to solve — SOLVED in `8dfaa071`

**Desktop Basic and mobile Basic were two different applications.** They are
one now; §5.1 has the measurements. This section is kept as written because it
is the argument the rest of the work rests on, and because the baseline table
at the end of it is what the after-numbers are compared against.

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

## 4. ANSWERED — the model does render. There was no bug.

Settled by driving the UI path at 375×667 in Chromium with touch: menu →
Ejemplos 2D → tap one. The canvas draws the member, both supports, the
distributed load with its `D: 10.0 kN/m` label and the node numbers.

The control run is what makes it conclusive. The *same* example loaded through
`window.__stabileoActions.loadExample()` in the *same* session reproduces the
old symptom exactly — grid, axes gizmo, no members — and dispatching
`stabileo-zoom-to-fit` by hand immediately afterwards brings the model back,
pixel-identical to the UI path.

So the two earlier attributions were right after all: the hook does not frame,
`ToolbarExamples` does (it dispatches the fit 50 ms after loading), and every
mobile screenshot that showed an empty canvas had been taken through the hook.
`72f5c9e0` is the whole of it. Nothing about rendering is outstanding.

The lesson is the one already in §8 and it earned its place: **measure the UI
path when what you are measuring is what a user sees.** A `memberPx` counter is
also a trap — members are drawn in grey, `#4ecdc4` is the *selection* colour, so
a pixel probe keyed to it reports zero on a perfectly good canvas. Look at the
screenshot.

Reproduce:

```bash
cd web
NODE_OPTIONS= VITE_E2E=1 npm run build
NODE_OPTIONS= npx vite preview --port 4258 --strictPort &
# then drive Chromium at 375×667, isMobile: true, hasTouch: true
```

---

## 5. Work remaining, in order

### 5.1 DONE — one shell instead of two (`8dfaa071`)

Mobile Basic is the ribbon adapted. Measured at 375×667 and 430×932, Chromium
with touch:

```
                       375×667              430×932
                    before    after      before    after
ribbon              absent    present    absent    present
left toolbar        drawer    removed    drawer    removed
floating tool bar   present   removed    present   removed
mobile bottom bar   present   removed    present   removed
mobile results pnl  present   removed    present   removed
right drawer        present   removed    present   removed
horizontal overflow none      none       none      none
canvas share        85 %      79 %       89 %      85 %
ribbon commands     0         17         0         17
duplicate mounts    2         0          2         0
controls under 44px 14        3 / 14     14        3 / 14
```

**Read that last row carefully — it is two measurements, not one.** 3 with no
panel open; 14 once results are on screen. The number depends entirely on
what is showing, and quoting it without the state is how "14" got compared
against a "3" measured somewhere else. §5.2 has the breakdown.

Canvas share goes DOWN and that is the trade, stated plainly: the ribbon costs
about 6 % of the screen and buys the phone the other half of the application —
Selection, the results selectors, the colour scale, Advanced, the walkthroughs,
none of which a phone could reach at all before.

What was built, against the suggested shape:

- Ribbon degrades to one horizontally scrollable row of 44 px icons below
  768 px. Group captions are hidden; the hairline rules between groups already
  carried the grouping, so the caption was the redundant half of the pair.
- `rb-quick` was **reordered to the end, not folded into an overflow.** The
  overflow buys ~44 px of a row that scrolls anyway, and it costs `hdr-project`
  its place on screen — the entry point eight walkthroughs and the demo audit
  reach for by test id, behind a tap nothing knows to make. §5.4 flagged exactly
  this risk. `order: 2` moves the box without moving the element, so every id
  keeps its position in the DOM. At scroll 0 the resting view is the build loop:
  Selection, 3D, Data, Node, Element, Support, Load.
- `FloatingTools`, both mobile drawers, the mobile bottom bar and
  `MobileResultsPanel` are gone from Basic. Education keeps `FloatingTools`
  while authoring; PRO keeps its drawer, its bar and its results panel.
- `BasicPanel` is the bottom sheet below 768 px, and it **shares** the screen
  rather than covering it — `.app-body` reserves `--st-sheet-h` (58vh, in
  `styles/tokens.css`), so the canvas is the size it appears to be. Overlaying
  it instead drew the moment diagram behind the panel opened to control it.

Two defects found on the way past and fixed in the same commit:

- `Toolbar` was mounted **twice** on a phone — in the drawer, and again in
  `.app-body` behind `leftSidebarOpen` where `.sidebar { display: none }` hid
  it. Two live copies of a 2,400-line component that was never shown, and every
  id inside it existed twice.
- A `basico && isMobile` branch sat inside a `!isMobile` block. Unreachable
  since it was written.

Files touched: `src/App.svelte`, `src/components/ribbon/Ribbon.svelte`,
`src/components/ribbon/BasicPanel.svelte`,
`src/components/MobileResultsPanel.svelte`,
`src/components/toolbar/ToolbarExamples.svelte`, `src/lib/store/ui.svelte.ts`,
`src/styles/tokens.css`.

### 5.2 Remaining touch targets — re-measured, and the count depends on state

**The shell is done. What is left is panel CONTENT.** That is the finding, and
it is a different job from the one this section was written to describe.

The ribbon, the sheet header and its ✕ were built at 44 px in 5.1. But the
components those panels render — `ToolbarResults`, `DataTable`, the selectors —
were written for a 320 px desktop side panel and carry desktop density. They
now appear on a phone unchanged.

Measured at 375×667. **With nothing open, 3:**

| control | size | where |
|---|---|---|
| tab rename field | 139×19 | `TabBar.svelte`, `.tab.active` |
| `[data-testid="pointer-mode"]` | 32×32 | `PointerModeButton.svelte` |
| its twin, zoom-to-fit | 32×32 | `.viewport-controls`, `Viewport.svelte` |

**Solved, with a moment diagram and the results sheet open, 14** — the three
above plus eleven inside the sheet:

| control | size | where |
|---|---|---|
| ◀ reducir escala | 19×**13** | `.input-group`, `ToolbarResults` |
| ▶ aumentar escala | 18×**13** | idem |
| scale field | 80×24 | idem |
| Diagrama / Mapa de colores | 65×22, 102×22 | `.seg`, `ToolbarResults` |
| load-case + comparison selects | 112×22, 114×22 | `.input-group` |
| results case select | 318×24 | `.results-case-bar` |
| Desplazamientos / Reacciones / Fuerzas Internas | 112×25, 84×25, 110×25 | `.results-sub-tabs` |

Every one of them is short in HEIGHT, not width — the giveaway that these are
desktop rows in a phone-width container. The two scale steppers at 13 px are
the worst controls in the application by some distance.

Three ways to take this, smallest first:

1. **The two steppers only.** They are indefensible at 13 px and the fix is
   local. Leaves twelve.
2. **`ToolbarResults` properly** — one density pass so its rows are 44 px below
   768 px. This is the panel a reader actually lives in, and it owns eight of
   the eleven. Recommended.
3. **Every panel body** — results, model data, advanced, settings, project.
   The whole density question. Largest, and worth scoping only after (2) shows
   what a pass costs.

Whichever is chosen, **measure with a panel open**. The probe reports what is
on screen, so a run against an empty model says 3 and means nothing.

The two 32×32 canvas buttons are a deliberate pair — `PointerModeButton` is
documented as "sized and skinned as the twin of zoom-to-fit directly below it"
— so they move together or they stop being a pair.

The probe used:

```js
[...document.querySelectorAll('button, select, input')]
  .map(e => { const r = e.getBoundingClientRect(); return {
    t: e.textContent?.trim().slice(0,18),
    id: e.getAttribute('data-testid') || e.getAttribute('title'),
    // Without the parent class the report says a control is too small and not
    // which component to open. That cost a whole extra run.
    parent: e.parentElement?.getAttribute('class'),
    w: Math.round(r.width), h: Math.round(r.height) }; })
  .filter(x => x.w > 0 && x.h > 0 && (x.w < 44 || x.h < 44))
```

### 5.3 The bottom sheet needs a grab handle and a drag — NEXT

Still the right next piece, and 5.1 sharpened the case rather than settling it.

It is fixed at `--st-sheet-h` (58vh, `styles/tokens.css`). It should be
draggable between a peek height and full, because reading a results table wants
more than half the screen and reading a diagram wants less. There is still no
affordance saying it can be resized, because it still cannot.

Two things 5.1 changed that whoever picks this up needs to know:

- The sheet is no longer an overlay. `.app-body` reserves `--st-sheet-h`, so
  changing the height has to move **both** the panel's box and that
  reservation — the token is the single place, which is why it is a token.
- `App.svelte` re-frames the model on the sheet's open/shut transition, and
  deliberately not on a change of which panel is showing. A drag will need the
  same treatment: refit when the drag ENDS, not on every pointermove, or the
  model will chase the handle.

`BasicPanel.svelte` hides `.bp-resize` below 768 px — a horizontal drag on the
leading edge cannot widen a full-width sheet. The grab handle is a new control
on the top edge, not that one repurposed.

### 5.4 The tutorials on a phone — anchors survived, unverified ON a phone

**The eight walkthroughs pass.** `audit-demos.mjs` reports `sin problemas`
after 5.1, and `e2e/basic-demos.spec.ts` is 12 passed / 1 flaky (the documented
one, see §6).

Both of those run at **1500×950**. So what is established is that 5.1 did not
break the anchors — which was the risk the section was written about, and the
reason `rb-quick` was reordered rather than folded behind an overflow.

What is NOT established is that a walkthrough is *followable on a phone*. The
anchors now exist there for the first time, so this is newly worth testing and
newly possible to test. Two specific doubts:

- A step highlighting a ribbon command that is scrolled off the row. The
  highlight is clamped to the viewport (§8), so it will point at the edge
  rather than at nothing — but nothing scrolls the row to bring the command
  into view.
- A step pointing at `basic-panel` while the sheet has it: the tour card and the
  sheet both want the bottom of the screen. `tour-steps.ts` had
  `mobileCardMaxHeight: '35vh'` for this class of problem — note that file is
  **dead code**, imported by nobody; the live demos are `src/lib/tour/demos/*`
  on `demo-helpers.ts`.

Run the audit at 375×667 with touch to find out. It hardcodes its viewport at
line 27.

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

It imports `playwright`, so it needs the package to resolve. Rather than
copying it into `web/` — temporary scripts stay out of the repository, §7 —
symlink the modules next to it:

```bash
ln -sfn <worktree>/web/node_modules <scratchpad>/node_modules
node <scratchpad>/audit-demos.mjs
```

Expects the preview on `:4258`. Prints `sin problemas` or a list. It hardcodes
its viewport at line 27 (1500×950) — change it there to audit a phone.

**Suites** — all four run as of `8dfaa071`:

```bash
cd web
NODE_OPTIONS= npm run typecheck                     # 479 = baseline. PASS
NODE_OPTIONS= npm run test                          # two vitest passes
NODE_OPTIONS= npx playwright test e2e/basic-demos.spec.ts   # 12 passed, 1 flaky
```

Known: one test in `basic-demos.spec.ts` is declared with two retries and
reports flaky roughly one run in twenty. It drives a canvas whose layout moves
between steps; the walkthrough itself is deterministic. It flaked once during
5.1 and then passed 4/4 on first attempt when run alone — and 5.1's changes are
all behind `isMobile` or `max-width: 767px` while that spec runs at desktop
size, so it cannot be causal. Do the same check before blaming a change for it.

Known and **not from this branch**: `chs-shear-agreement.test.ts` fails on
`main` (circular tube shear, Diego's #157). Verified by stashing, twice — once
when this handoff was written and again after 5.1.

**Before trusting a preview on `:4258`**: check what is already bound to it.
A stale `vite preview` from an earlier session serves the bundle it was built
from, and it will happily answer 200 while you measure the wrong code. Confirm
the served `assets/index-*.js` hash matches the build you just made.

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
  what you are measuring is what a user sees. §4 is the whole cautionary tale:
  three sessions spent doubting the renderer over a measurement artefact.
- **Do not key a pixel probe to `#4ecdc4`.** That is the *selection* colour.
  Members are drawn grey, so a "are the members there" counter built on it
  reports zero on a correct canvas. Look at the screenshot.
- An element hidden by `display: none` is still **mounted**. `.sidebar` is
  hidden below 768 px, which is how a phone came to carry two live copies of
  `Toolbar` with every test id inside it duplicated — invisible on screen and
  invisible in a screenshot, but it breaks strict-mode locators and it is real
  work the phone was doing for nothing. Count mounts, not pixels.
- A `position: fixed` panel does not resize the canvas. If a sheet covers the
  model, `zoom-to-fit` still frames against the full canvas and puts the model
  behind the sheet. Reserve the height on `.app-body` so the two share the
  screen — `--st-sheet-h` in `styles/tokens.css` is that reservation.
- Every `var(--st-*)` **without a fallback** must be defined in
  `src/styles/tokens.css`. `design-tokens-resolve.test.ts` enforces it and it
  scans that file only — declaring a token in a component's `:global(:root)`
  fails the suite, which is the right answer: it is the convention, not a
  technicality.
- `uiStore.floatingToolsTopOffset` was derived from `showFloatingTools`, a
  **persisted user setting**, not from whether the strip is mounted. Any gate
  that unmounts a component whose size something else reserves has to update
  the reservation too.
- Left behind by 5.1, harmless but worth knowing: `uiStore.leftDrawerOpen` and
  `uiStore.leftSidebarOpen` are now vestigial. Their only remaining readers are
  `src/lib/tour/tour-steps.ts`, which **nothing imports** — dead code kept
  compiling. Deleting that file and the two store fields is a clean sweep for
  whoever wants it; it was left out of 5.1 to keep that commit about the shell.
