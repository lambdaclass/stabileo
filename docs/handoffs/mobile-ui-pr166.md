# Handoff — PR #166, mobile UI for Basic

Branch `basic/mobile-ui`, draft, targets `basic/demos` (#163).
Written to be picked up cold: everything below is measured, not remembered.

---

## 1. Where this stands

The branch now carries the whole phone shell for both modes; `git log basic/demos..` is the list, each verified at 375×667 and 430×932 in Chromium with
touch enabled:

| commit | what it does | evidence |
|---|---|---|
| `72f5c9e0` | `zoom-to-fit` waits for the canvas backing store to match its CSS box | defensive; see §4 |
| `16f8f2ef` | header touch targets ≥ 44 px; language selector moves to Settings | 14 undersized controls → 0 |
| `225f0ca1` | right panel becomes a bottom sheet on phones | 226 px of model stays visible |
| `8dfaa071` | one Basic instead of two: the ribbon at every width (§5.1) | see the table in §5.1 |
| `3ca2fd6f` | the phone row gathers into clusters; the sheet is dragged (§5.1b, §5.3) | see §5.1b |
| `81a178f3` | the data tabs become the modelling buttons; toasts, sliders (§5.1c) | see §5.1c |
| `e68f71b5` | the six data tabs become one row of icons | 6 × 59×44, one row, 367/375 px |
| `6a350081` | Settings gets an opener on the phone — it had none | §8 |
| `a8b9d6cb` | the row fills the width; Settings back in its corner | 0 px overflow at 375/390/430 |
| `1ec4af30` | the eight walkthroughs work on a phone (§5.4) | audit `sin problemas` at 375×667 |

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
- `rb-quick` was reordered to the end rather than folded behind an overflow.
  **Superseded by `3ca2fd6f` — see §5.1b.** Reordering moved the swipe around
  instead of removing it, and the reader said so.
- `FloatingTools`, both mobile drawers, the mobile bottom bar and
  `MobileResultsPanel` are gone from Basic. Education keeps `FloatingTools`
  while authoring; PRO keeps its drawer, its bar and its results panel.
- `BasicPanel` is the bottom sheet below 768 px, and it **shares** the screen
  rather than covering it — `.app-body` reserves `--st-sheet-h` (in
  `styles/tokens.css`; 58vh then, 45 now), so the canvas is the size it appears
  to be. Overlaying
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

### 5.1b DONE — the row gathers instead of scrolling (`3ca2fd6f`)

5.1 kept all seventeen commands on one flat row and made it scroll well. That
was the wrong target: at 44 px they are 748 px of content in a 375 px viewport,
so the swipe *is* the interface no matter how the row is ordered. The reader
rejected it on sight, which is the right call and worth recording — a
measurement can say "no horizontal overflow of the page" while the thing the
page contains is still unusable.

**Gathered, the way PRO already does it.** Nine controls:

```
Proyecto │ ↶ ↷ │ Selección  2D/3D  Modelado▾  Calcular  Avanzado  Resultados▾
```

- `Modelado` opened node, element, support, load, materials, sections.
  **Superseded by `81a178f3` — see §5.1c.** It is a plain command now.
- `Resultados` opens the diagram commands. Still a cluster.
- Both are drawn as commands with a caret, and **light when the command they
  stand in for is the active one** — otherwise the ribbon's one rule ("lit means
  this is what the panel is showing") dies the moment the lit command is inside
  a closed button.
- The menu has a **backdrop**. Without it the tap that dismisses it falls
  through to the canvas and places a node.
- `CLUSTERS` reads the existing `GROUPS` rather than restating their contents.
  A command added to `draw` reaches the phone for free; a second list would be a
  second definition of the ribbon.

Save left the row — it is inside the Project panel that button opens. Undo and
redo stayed: those ARE per-gesture where a mis-tap places a node.

```
                       375×667          430×932
                    5.1      5.1b     5.1      5.1b
controls in the row  21       9        21       9
content width       748 px  407 px    748 px  407 px
swipe to the last   ~460 px  32 px    ~460 px   0 px
all ≥ 44 px          yes     yes       yes     yes
```

**The 32 px is gone** — `a8b9d6cb`. Nine fixed 44 px squares came to 396, so
375 scrolled and 430 left 34 px of dead space; both are a fixed size on a row
whose job is to be the width of the screen. Every slot is `flex: 1 1 0` now:
39–41 px at 375, 43 at 390, 47 at 430, nothing scrolling at any of them. Four
pixels under the reference at the smallest size, deliberately — always visible
beats correctly sized and off screen — and only in width, since the height
stays 44.

**The `data` command is gone from Basic at both widths.** Every command that
produces model data already opens that panel on its own tab, so the button
opened a panel the reader reached anyway. Nothing anchors it: the walkthroughs
call `openPanel('data')`. Verified against all eight.

Two traps found building it, both invisible until a menu is opened on a phone:

- `.ribbon` had no `position`, so the menu's `top: 100%` resolved against a
  distant ancestor and the menu opened at the BOTTOM of the page, behind the
  sheet. A popover's anchor must be positioned; nothing warns you.
- The sheet is `z-index: 60`. A menu at 59 is painted under it, so half the
  commands are visible and untappable. The menu is 70/71.

### 5.1c DONE — the data tabs are the modelling buttons (`81a178f3`)

The `Modelado` cluster was six buttons that each opened the Model data panel on
an entity's tab with its tool armed. The panel's own tab strip is those same six
choices and already did exactly that — `pickTab` in `DataTable.svelte` arms each
tab's tool, and has since it was written, precisely so the tab and the ribbon
agree. The menu was a second copy of the strip, shown for one tap and discarded.

So the command opens the panel, and below 768 px the tab strip stops looking
like tabs:

- six equal targets in **one row** — `e68f71b5`; 59 × 44 px each, spanning 367
  of 375. Two rows of three made the strip a different shape on every handset,
  since which three wrapped depended on what fit. At 59 px a word does not fit,
  so each button carries the RIBBON's glyph for that entity — the reader
  recognises it from the desktop instead of learning a second vocabulary — with
  the name at 0.5rem beneath and the count as a corner badge;
- `position: sticky` at the top of the panel's scroll, so a long table never
  takes the way out of it off screen;
- fixed on purpose — a strip that reflows with the number of loads is one the
  reader has to re-read every time;
- `Modelado` lands on the tab last used and arms that tab's tool, so it leaves
  you able to draw. Materials and sections correctly arm none.

`.bp-body` loses its horizontal padding for this panel so the grid and the table
go edge to edge.

**The "DATOS" heading is gone**, and the ✕ moved to the grab-handle row — one
place to close from whichever panel is up. Other panels keep their heading;
Results and Project have nothing else that names them. Watch for the duplicate:
hiding `.bp-close` on mobile is what stops the ✕ appearing twice, four
millimetres apart.

Three smaller things in the same commit, all measured on a phone:

- **Toasts** start at `top: 146px` — under the options bar, over the canvas —
  instead of `50px`, where "Cálculo exitoso" covered the diagram commands the
  reader was about to press because of it. They stop at `right: 56px` so the ✕
  does not land on the canvas's own two buttons. The ✕ is 44 px and opaque
  rather than 12 px at half opacity.
- **The toast container was eating the screen.** The phone rule set a `top`
  without clearing the desktop `bottom`, so a fixed invisible box spanned the
  whole viewport at z-index 1100 and swallowed every touch that was not on the
  toast — after every solve, for as long as the message lived. `pointer-events:
  none` on the container, `auto` on the toasts. **This is the general lesson:
  overriding one edge of a `position: fixed` box without clearing the opposite
  one silently makes it full-size.**
- **Scale sliders** were `style="width: 80px"` inline, which no stylesheet could
  beat. Moved to CSS; on a phone the label takes its own line and the track gets
  271 px of 375. Fifty steps need somewhere to land.

### 5.2 DONE, as a setting rather than a verdict (`3ca2fd6f`)

The shell is at 44 px. What stayed small is panel CONTENT: `ToolbarResults` and
the selectors around it were written for a 320 px desktop sidebar, so their rows
are 22–25 px and the two diagram-scale steppers are 13. Every one is short in
HEIGHT and not in width — the signature of a desktop row in a phone-width box.

Enlarging them is not free, and the cost is not cosmetic: it adds 124 px to the
panel's content, which is 124 px more scrolling before the results table. Denser
rows show more of the answer; bigger rows are easier to hit. Which wins depends
on the hand and the handset, so it is **Ajustes → Tamaño de los controles**,
phone only, defaulting to `compact` — which is what the panels already were.

```
with results on screen        compact   comfortable
controls under 44 px            11          0
content height                415 px     539 px
hidden scroll, sheet at 45 %  197 px     321 px
hidden scroll, sheet at 69 %   37 px     161 px
```

Which is why §5.3 mattered first: at a fixed 58vh, `comfortable` would have been
strictly worse. With the drag, it costs nothing you cannot undo with a thumb.

Lives in `src/styles/touch-density.css` — global, because the rows belong to
several components with scoped styles and no useful shared parent. Keyed on
`data-touch-density` on `<html>`, written by `uiStore.touchDensity`, and scoped
under `.basic-panel` so it can only reach the sheet's contents.

**The model data table is deliberately exempt.** It is a grid of numbers to
read, not controls to hit; 44 px rows would put four on a screen and turn
reading a model into scrolling one. Its editable cells still follow the setting.

The three controls OUTSIDE the panel are unchanged and still under 44 px: the
tab rename field (139×19) and the pointer-mode / zoom-to-fit pair (32×32). The
pair is documented as a pair and has to move together, and both sit on the
canvas, where 44 px costs model area. Left as a deliberate open question.

When adding a control to the density sheet, **measure with a panel open** — the
probe reports nothing useful against an empty model.

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

### 5.3 DONE — the sheet opens lower and is dragged (`3ca2fd6f`)

Opens at **45vh** rather than 58, and resizes between 22 % and 86 % from a grab
handle above the title. The chosen height is remembered
(`stabileo-basic-sheet-vh`).

58 was picked to make a results table worth reading. It did not manage it — the
table began 10 px above the bottom of the screen — and it charged the model more
than half the height to fail at it.

```
                 model     sheet    hidden scroll in the body
peek   (22 %)    375 px    152 px   345 px
open   (45 %)    227 px    300 px   197 px
tall   (69 %)     67 px    460 px    37 px
before (58 %)    139 px    387 px    87 px   ← the single fixed value
```

**Dragging is not scrolling, and that was the requirement.** The handle is the
only surface that resizes; the body keeps ordinary `overflow-y: auto`. What
makes it hold is `touch-action: none` on the handle — without it the browser
claims the gesture as a scroll and a drag flings the list underneath. Verified:
a full drag leaves the body's `scrollTop` at 0.

Three things whoever touches this next needs to know:

- The height is published to `--st-sheet-h` on the ROOT element, not set inline,
  because `.app-body` reserves the same value so the canvas is really the size
  it looks. The token is the value it opens at; `publishSheet()` overrides it.
- It is handed back on unmount. Leaving it would keep a band of canvas walled
  off for a panel that is no longer there.
- The re-frame fires at the END of the drag, not during. The canvas has just
  changed height by up to 60 % of the screen, so the previous framing is wrong —
  but refitting per pointermove makes the model chase the handle.

### 5.4 DONE — the eight walkthroughs work on a phone (`1ec4af30`)

They never had, and the reason was structural rather than neglect: until this
PR the phone mounted no ribbon for them to point at.

Five anchors did not resolve at 375 px, and they needed two different repairs:

| anchor | why it broke | repair |
|---|---|---|
| `rb-cmd-sections` | is a data-panel TAB on a phone | `ANCHORS.ribbonCommand` answers `dt-tab-sections` |
| `rb-cmd-materials` | idem | idem |
| `rb-cmd-stress` | inside the Results cluster | step opens the cluster first |
| `rb-cmd-momentY` etc. | idem | idem |
| `[data-group="results"]` | the group is one button there | `ANCHORS.ribbonGroup` answers the cluster button |

`openCluster()` goes through an event, like `openPanel`, rather than exporting
the ribbon's state — a step definition describes cards, not the shell's layout.
It is a no-op on a desktop, so a step calls it unconditionally.
`ANCHORS.needsCluster(id)` tells a reader of the demos which steps depend on it.

**How it was verified, and why the obvious check is not enough.** Walk every
step at BOTH widths and diff: a step that lights its target on a desktop and
not on a phone is the defect, and neither run alone can show it — a phone-only
run cannot tell "this step has no target" from "this step never had one".
Zero remain.

The audit cannot finish `results` or `modelling-2d`; both stop on a step that
waits for the reader, at either width. Those two were walked separately with
the waits satisfied through the store: all ten and all nine steps light, the
Results menu opens for the diagram cards, and the Secciones tab carries the
highlight for the section card.

`audit-demos.mjs` now takes a viewport (`node audit-demos.mjs 375 667`) and
reports `sin problemas` at both. **Run it at both from now on** — passing at
1500×950 was never evidence about a phone, and this section is the proof.

### 5.5 PRO — the phone shell is built (option C)

Proposed as four options and built as the one that survives PRO growing. The
desktop shows four STAGES and, under the one you are in, its groups; that does
not shrink, because ANALYSE alone carries fifteen commands and a touch row holds
about nine.

**Shape.** The bar keeps only verbs — undo, redo, pointer, solve, camera. Both
halves of "where am I" are two pills in the sheet, half the width each: command
on the left, stage on the right. Project is an entry in the left pill and greys
the right one, because the document belongs to no stage.

**Why it survives change, which was the requirement.**
`src/lib/pro/stages.ts` holds the command tree; the desktop ribbon and the phone
grid both read it. A command added there gets a ribbon slot and a grid cell and
nothing else has to be revisited — the bar is a fixed set of verbs whatever size
PRO reaches. `src/lib/pro/camera-actions.ts` does the same for the view
controls.

`src/lib/pro/__tests__/stages-coherence.test.ts` is the guard. The realistic
failure is not a careless edit; it is someone on another branch adding a good
command without knowing `PRO_TAB_STAGE` is a second list that must learn about
it — the ribbon looks right and the phone silently names the wrong stage,
because the lookup falls back to `'model'`. **Verified by breaking it**: adding
a `buckling` command with an unmapped tab fails the suite with a message saying
which command and what to add.

**Measured at 375×667:**

```
                       before   after
camera buttons on the model    9        0   (one split button in the bar)
controls under 44 px          15        5
bar overflow                   —        0   (also 0 at 430)
grid columns                   —        4 at 375, 5 at 430
dead controls                  1        0   (Calcular; see below)
```

The five that remain are the split button's caret (20×44, deliberate), the
sheet's ✕ (44×40) and three of PRO's own panel controls at 26 px tall, which
answer to the density setting.

**Calcular was wired to nothing.** `proPanelRef` was bound only to the desktop
`ProPanel`, so on a phone it was null: the bar read `canSolve()` off nothing and
rendered permanently disabled. Both instances are bound now, and they are
mutually exclusive, so the bar's Calcular and the ANALYSE grid's are one method
on one component. **This is the class of defect to look for** — a control that
is present, enabled-looking and connected to a reference that only exists at the
other width.

### 5.6 Both phone shells, audited

Every visible, enabled control in both modes, pressed, with app state read
before and after. `audit-mobile.mjs` in the scratchpad.

**Zero dead controls in either shell.** A sequential sweep flagged five in PRO;
all five were disproved individually and were artefacts of the sweep's own
state drift — pressing controls in order leaves the shell somewhere that makes
the next one a legitimate no-op. **A sequential audit cannot tell a dead button
from one whose precondition the previous step removed.** Re-check candidates
from a clean state before believing them; that is what `audit-five.mjs` does.

Remaining under 44 px, both modes, and all deliberate or already tracked:

| where | size | note |
|---|---|---|
| Basic's row, 9 slots | 39–41 × 44 | they share the width; §5.1b |
| pointer-mode / zoom-to-fit | 32 × 32 | a documented pair, on the canvas; §5.2 |
| PRO's camera caret | 20 × 44 | half of a split button |
| PRO's sheet ✕ | 44 × 40 | four short |
| PRO's panel rows | 26 tall | answers to the density setting |

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
- **A control can be present, sized to nothing, and pass every existence
  check.** The restore-a-project prompt renders inline in the header. On a
  phone that header holds a logo, a mode selector, a project name and a settings
  button in 375 px, and the prompt got what was left: **19 px wide by 54 tall**,
  in both modes. It was in the DOM, so it looked fine to anything asking whether
  it existed. Assert a minimum SIZE, not presence, for anything that has to be
  read.
- **A sequential control sweep produces false "dead button" reports.** Pressing
  every control in order leaves the shell in states where the next one is a
  legitimate no-op — five of PRO's were flagged this way and all five worked
  when re-checked from a clean start. Confirm candidates individually.
- **`bind:this` on one of two mutually exclusive instances silently disables
  whatever reads it.** PRO's mobile `ProPanel` was unbound, so the phone's
  Calcular read `canSolve()` off `null`, rendered disabled forever, and would
  have done nothing if pressed. Nothing errors; the button just never works.
- **A control moved into a panel whose opener is gated can become unreachable,
  and nothing fails.** `16f8f2ef` moved the language selector into Settings
  *for phones*, on good reasoning — the header slot was too expensive. But the
  Settings button itself is `{#if ... && !uiStore.isMobile}` in the header, so
  the panel had no opener at that width: the control was hidden from where it
  was and hosted where it could not be reached. `3ca2fd6f` then added control
  size to the same panel. Two phone-only settings, unreachable from a phone,
  for two commits. Fixed in `6a350081` — Settings opens from Project, the
  phone's app menu. **When moving a control "into X for width W", check that X
  can be opened at width W.**
- Left behind by 5.1, harmless but worth knowing: `uiStore.leftDrawerOpen` and
  `uiStore.leftSidebarOpen` are now vestigial. Their only remaining readers are
  `src/lib/tour/tour-steps.ts`, which **nothing imports** — dead code kept
  compiling. Deleting that file and the two store fields is a clean sweep for
  whoever wants it; it was left out of 5.1 to keep that commit about the shell.
