# PR20 — manual QA checklist

**PR20 stays in draft while this is walked.** Branch `feat/pro-visual-system`, PR #125.

## How to read this

Every item is a thing an automated test **cannot** decide. The suite already proves that the
controls exist, that the counts are right, that the focus returns and that nothing overflows —
402 passed. What it cannot prove is whether the result reads as one product, whether a sentence
explains what it claims to explain, and whether a drawing is legible.

So: **do not re-verify what the tests cover.** Look at the things marked ⚠, which are where this
pass changed a judgement rather than a fact, and at the ⛔ items, which are known and deliberately
unfixed.

**Setup.** `npm run dev`, port 4000. Use a **1280×720** window — that is the smallest size PR20
claims to support and the size every defect in this pass showed at. Have the 7-storey example
(`pro-edificio-7p`) ready.

**If something is wrong**, capture: the window size, the language, the section, and what you
expected. A screenshot alone is not enough to reproduce a layout defect.

---

## 1. The Design workflow, end to end

Load `pro-edificio-7p` → solve → open the **Diseño** tab.

- [ ] The tab opens on **Estado del proyecto**, expanded, with the code in force and the member
      counts. ⚠ This moved from the very bottom of the tab in this pass — check it answers
      "where does this project stand" without scrolling.
- [ ] The stage strip reads `1 Model › 2 Demands › 3 Code check › 4 Design › 5 Detailing ›
      6 Documents`, and the hint underneath names the next thing to do.
- [ ] Clicking a stage **navigates** and never runs anything.
- [ ] Walk the whole pipeline: Calcular solicitaciones → Verificar según norma → Diseñar todo →
      Dimensionar y despiezar pisos → Regenerar detallado → Documentos.
- [ ] At each step the strip advances and the hint changes. ⚠ Does the order the strip states match
      the order you actually had to work in? That is the one thing the tests take on faith.
- [ ] ⛔ **Known**: a toast can land on the command row at 1280×720. It auto-dismisses. Whether a
      transient notice may cover the primary commands is a design decision, deliberately not
      patched — say what you think.

## 2. English, Español, Português

Switch with the language picker in the header. Repeat §1 briefly in each.

- [ ] Nothing is cut off, wrapped mid-word, or pushed outside its box. **Portuguese is the long
      one** in this app — the role purposes and the family scopes are a sentence each.
- [ ] No raw key on screen (`design.families.state.notRun` and the like). ⚠ One wrong key did ship
      during this pass and was caught by a test; look anyway.
- [ ] ⛔ **Known and NOT fixed**: the detailing engine's own text — calculation memos, sheet notes,
      DXF annotations, the "PARA REVISIÓN — NO APTO PARA CONSTRUCCIÓN" stamp — is **Spanish-only in
      all three languages**. 423 literals across 21 files. Extracting them means editing the
      modules that compute punching shear, splice lengths and footing flexure, which was out of
      bounds for this PR. Confirm you are content to ship that, or decide it blocks.

## 3. Familias a diseñar

- [ ] Before running anything, each of the five families shows a row with **what the model holds**
      and **where it stands**. ⚠ The whole point of this pass: the section used to be five bare
      checkboxes with nothing under them.
- [ ] `Losas` and `Tabiques` say **"todavía sin contar"**, not "0". That is deliberate — which
      shell is a slab and which is a wall is decided by the floor pass, and a zero before it runs
      would be fabricated. Check the sentence explaining it makes sense to you.
- [ ] The three scopes are stated: `Diseñar todo` (frame only), `Diseñar las familias tildadas`,
      `Dimensionar y despiezar pisos`. ⚠ Read them as a newcomer: can you tell which button to
      press without pressing one?
- [ ] Untick `Bases` → the state changes to "omitido". Tick it back → "no ejecutado".
- [ ] Run it. Each family reports designed / rechazado (with a count) / provisorio / sin elementos.
- [ ] On an **empty project**, the section explains why there is nothing to design instead of
      showing a blank area.

## 4. Reglamentos del proyecto

- [ ] ⚠ No white dropdowns. Every select, input and button looks like it belongs to Stabileo.
      This whole section was on browser defaults before this pass.
- [ ] The section title (`1 · Reglamentos del proyecto`) is never visually smaller than the text
      inside it.
- [ ] Each role says **what it decides** and what edition is in force.
- [ ] Tab through it: every control takes a visible focus ring.
- [ ] Change a load-affecting regulation → the panel asks you to review it in Loads and offers to
      cancel. It must never apply that change itself.
- [ ] `Ediciones no disponibles` lists what the catalogue knows but cannot apply, **with a reason**.
- [ ] At 1280×720, in Portuguese, with `Avanzado` open: nothing runs past the right edge.

## 5. Diseño de pisos

- [ ] The section states **what it does**, **what it leaves alone** (columns and beams) and **what
      comes next** (the coordinated detailing).
- [ ] Disabled, it lists the exact prerequisites.
- [ ] Run it on the 7-storey building. ⚠ While it runs it says the pass **cannot be interrupted** —
      there is no cancel, and no fake progress bar was invented. Is that acceptable for a run of
      this length, or does it need a real cancel? That is a product decision.
- [ ] Losas / Tabiques / Fundaciones each show their results, and unsupported conditions are listed
      verbatim rather than summarised into a count.

## 6. Detallado coordinado

- [ ] The result is stated in one line before you open anything.
- [ ] Problems are ranked: **blocking errors first**, then warnings, then the all-clear. ⚠ They used
      to sit below several hundred bar rows.
- [ ] Each conflict offers the **members** it involves and the **sheet** it is drawn on.
- [ ] Click a member chip → that element is selected in the model, and the rest of the app follows.
- [ ] Click "En la lámina" → the enlarged sheet opens on that conflict.
- [ ] Severity is legible with the colour removed: glyph, word and a shortfall in mm.

## 7. Selector de niveles

- [ ] The level list collapses. ⚠ Collapsed, the drawing gets the room; the list used to hold a
      third of the panel permanently.
- [ ] Collapsed, it still says **which level you are on**.
- [ ] Reopening it restores the list, and the selected level is unchanged.
- [ ] Switching level updates the preview, the schedule and the problems together.

## 8. Preview ampliada — zoom, pan, cierre

- [ ] The preview has a caption: assembly, level, sheet kind.
- [ ] `⤢ Ampliar` opens a full-window view. ⚠ **This is the one to look hardest at**: is the drawing
      actually legible at a real 1:50 elevation, or still too small?
- [ ] Zoom: `−` / `100%` / `+` / `Ajustar 100%`, and `+` `-` `0` on the keyboard.
- [ ] Magnified past the window, the whole drawing is reachable by scrolling — nothing is clipped.
- [ ] Escape closes it and the focus returns to the `⤢ Ampliar` button.
- [ ] ⚠ The dialog must sit **above** the app's floating "?" button. That was a real defect fixed in
      this pass; check no other floating chrome covers it.

## 9. Documentos

- [ ] It is its **own stage** (6), below Detallado coordinado. ⚠ It used to be buried at the bottom
      of the detailing panel.
- [ ] The order reads: what document exists → exports → professional review → provisional
      acceptances → issue.
- [ ] Informe/PDF, Planos/DXF, Planilla/XLSX and Ver en 3D all produce a file or a view, and all
      describe the **same** revision.
- [ ] `Emitir para construcción`, disabled, says in text what it is waiting for.
- [ ] The declaration that software approval is not professional sign-off is present and readable.
- [ ] Accept the provisional calculations → record a review → issue. The engine must refuse
      anything out of order, and say why.

## 10. Ver en 3D, from every access

Three entry points, one operation:

- [ ] **Estado del proyecto** (top of the panel) — `Ver modelo 3D`.
- [ ] The command row — `Ver modelo 3D`.
- [ ] Documentos — `Ver en 3D`.
- [ ] All three open the same workspace showing the same scene. ⚠ The tests compare the scene census
      across all three; what they cannot check is whether having three is confusing. Say if it is.
- [ ] Disabled, the top one explains **in text** which step is missing — not only on hover.

## 11. The 3-D viewer at 1280×720

- [ ] It covers essentially the whole window; the canvas is large, not a frame around a thumbnail.
- [ ] Layers, selection, isolation and the conflict markers all work.
- [ ] Violet = proposal, orange = unreinforced, red = conflict. These were deliberately left alone.
- [ ] Closing it returns you to the same context, with the panel where you left it.
- [ ] ⛔ **Known**: the layer rail is not yet grouped by family, and the selection / isolation /
      section / opacity controls have no visible help text.
- [ ] ⚠ **The open risk**: switch to another browser tab, wait a few seconds, come back. On the
      7-storey building with the viewer open, the first click can take **1–4 seconds**. Measured on
      PR19 as well — PR19's worst cases are worse — so it is not a PR20 regression, but it is real
      and the cause is not located. Report how bad it feels in practice.

## 12. Sticky headers and collapsible sections

- [ ] Open **Losas, tabiques y fundaciones** and scroll down inside it. ⚠ The title that stays at
      the top of the panel must be **its** title — not `1 · Reglamentos del proyecto`. That was the
      reported defect.
- [ ] Every stage collapses and reopens, keeping its state.
- [ ] One scroll for the whole panel. Crossing a section should take one wheel gesture, not two.
- [ ] The stuck title never covers the first row or a control.
- [ ] ⛔ **Known**: the stage strip wraps to two lines at 1280×720, leaving a dangling chevron after
      the last stage on the first line.

## 13. Proyecto, `.ded` save and restore — the 7-storey building

- [ ] Design and detail the whole 7-storey building.
- [ ] Save a `.ded`. It should be about **48 MB**.
- [ ] Open it in a **new browser profile or an incognito window** — a page that has never seen this
      project, with no IndexedDB.
- [ ] Every member comes back under its own id, with its reinforcement and its detailing.
- [ ] Opening it must **not** solve and must **not** run a design.
- [ ] The 3-D scene is the same one, and the provisional banner still says so.
- [ ] Separately: reload the tab and accept the **autosave restore** banner. Same checks.
- [ ] ⚠ This is a data-export path. It is covered end to end by tests, and it still deserves one
      human look — a corrupted 48 MB file is a lost day of work.

## 14. Provisionals, conflicts, torsion

- [ ] The 5 provisional-biaxial proposals are labelled **provisional** everywhere they appear: the
      counts, the design table, the assembly banner, the sheet note and the report.
- [ ] A proposal is never folded into "verified" and never into "does not verify".
- [ ] Conflicts: the pager, the list, and the navigation to member and sheet all agree.
- [ ] The torsion notice appears where torsion was not evaluated, and says so in its own words.
- [ ] ⛔ **Labelled experimental in the product, on purpose**: the provisional-biaxial proposals,
      the torsion notice (deferred to PR21), and the CAD handoff, which states that its output is a
      semantic handoff and not a drawing.

## 15. Configuration and accessibility

- [ ] Tab through the whole right panel. Every control is reachable and shows a focus ring.
- [ ] Nothing is reachable **only** by mouse.
- [ ] Dialogs (`⤢ Ampliar`, the 3-D workspace) trap focus while open and return it on close.
- [ ] Every state is legible with the colour ignored — glyph and word, never colour alone.
- [ ] ⛔ **Known**: the conflict inspector is not reachable by keyboard, and 167 of the 413
      RC-surface test ids are referenced by nothing. The riskiest of those are `cmd-cancel` and
      `footing-delete`, which deletes without confirmation.

---

## The one thing NOT to do

⛔ **Do not update the visual snapshot.** `rc-design-visual › @slow visual baselines` fails at
696→697 px, 645 pixels differing — the same signature in every run of this session, including one
taken with all changes stashed. It needs a human to confirm by eye that the overlay legend is
unchanged, and then a commit of its own. It has never been updated automatically.

## What a green QA does and does not mean

Passing this list means PR20 is ready to **leave draft**. It does not close:

1. the **423 Spanish literals** in the detailing engine — a decision, not a fix;
2. the **tab-return stall** on large models, present on PR19 too, cause not located;
3. the **1 px snapshot**;
4. the coverage debt (167 unreferenced test ids, the keyboard-unreachable conflict inspector).
