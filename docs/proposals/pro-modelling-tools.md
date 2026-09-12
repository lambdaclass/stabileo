# PRO's modelling: what is there, what is missing, and what to build next

Written against the branch `pro/ui-and-education`. Every claim about the code
below was checked in the code, and the file and line are given where it
matters, because a plan built on what one remembers about a codebase is a plan
about a different codebase.

---

## 1. The finding that reorders everything else

**PRO has no drawing tools. You cannot put a node on the screen with the
mouse.**

Geometry in PRO is created by typing into a table: `ProNodesTab` has "Add
node", which appends an empty row you fill in with X, Y, Z and then Apply
(`ProNodesTab.svelte:173`). Members are the same, in their own table, by node
id. A reader who wants a portal frame types eight numbers, presses Apply,
switches tab, types four node ids, presses Apply.

What makes this worth stating rather than merely improving: **the viewport
already knows how to draw.** `Viewport3D.svelte` implements node creation at
the pointer with a coordinate dialog (`:780`) and two-click member creation
with a pending first node (`:2262`), gated on `uiStore.currentTool` being
`'node'` or `'element'`. Basic's ribbon arms exactly those tools.

PRO's ribbon only ever sets two values — `'select'` and `'pan'`
(`ProRibbon.svelte:266` and `:326`). **The capability is built, tested and
running, and PRO has no control that reaches it.**

So the first item on any list of modelling improvements is not a new feature.
It is a Draw group in the MODEL stage with Node, Member and Shell, arming the
tools the viewport already has. Everything else in this document is worth less
than that one change, and several items below are only worth building once it
exists.

**Why it probably happened.** PRO grew out of a table-first, import-first
workflow: you arrive with a DXF, an IFC or a spreadsheet, or you generate a
shed. That is a real way to work and it should stay. But it is the way to
START a model, and it leaves no way to CHANGE one: adding a single brace to an
imported frame currently means finding two node ids in a table.

---

## 2. Reviewing the flow, stage by stage

### What already works

- **The two-level ribbon.** Stage, then command, with the panel showing the
  command. Consistent with Basic since the ribbon/panel agreement landed.
- **Generators.** For the structures they cover (sheds, steel frames) this is
  the fastest path in the application, and correctly placed inside MODEL.
- **Import.** DXF plan, IFC, spreadsheet — three genuine ways in, and the
  spreadsheet round-trips through a schema with a drift guard.
- **Repeat selection.** Counts and spacings with `link` for the members
  between copies, which is what repeated floors need.

### What does not

**a. The tables are the only editor, and they are modal in the wrong way.**
Each table has Apply. Until you press it, nothing you typed exists; if you
switch tab first, the work is gone. A table that edits a live model should
commit per row on blur, the way the Model tables in Basic do, with undo
carrying the reversal. Apply-or-lose is a transaction UI on something that is
not a transaction.

**b. Nothing addresses geometry by selection.** Every operation that is not a
generator works on ids typed into a form. Select three columns and there is no
"give these a section", no "move these 200 mm", no "mirror these". The
`Repeat` panel is the exception and shows the shape the rest should take:
operate on what is selected, state what will happen, do it.

**c. Snapping exists but is invisible.** `snapToGrid3D` is on by default and
there is no indication in the viewport of what it will snap to. On a 1000 m
grid at 1 m spacing this matters: a click lands somewhere and the reader finds
out afterwards.

**d. There is no way back from a mistake inside a panel.** Undo covers model
mutations, but a half-filled table row is not a model mutation, so a reader
who mis-types in row 40 of 60 and presses Apply gets 60 rows of consequences
and one Ctrl-Z.

**e. The panels were uneven, and that is now fixed but worth recording.** The
inset beside the panel edge was whatever each of eighteen tabs chose:
Generators 12 px, Settings 3, and the nine that draw a table none at all. The
gutter belongs to `.pro-content` and is Basic's 0.65 rem — measured across
every tab, all now read the same 10 px. The lesson for new tabs: **do not put
horizontal padding on a tab root.**

---

## 3. Copy and paste of models — the real design

This is the item most worth doing properly, so it gets a design rather than a
line. The request is "a good copy-paste tool for models", and the important
word is *models*: not a clipboard of elements, but the ability to build a
structure once and place it many times.

### Why the obvious version is not enough

`Repeat selection` already does array copying, and a clipboard that pastes a
selection at an offset is an afternoon's work. Both stop at the same wall: a
copy is dead the moment it lands. Change the original and the copies do not
follow, which for the case that motivates this — a floor repeated over eight
storeys, then the column sizes change — means doing the work eight times or
deleting and re-copying, losing whatever was edited per floor.

### The shape I would build

**Stage 1 — Clipboard with intent (small).**
Copy and paste a selection, with paste asking WHERE rather than assuming: at a
picked node, at a typed offset, or at the original position in another tab.
Copies carry materials, sections, releases, supports and loads that belong to
the selected elements — the current `Repeat` code already decides these
correctly and should be shared, not reimplemented.

*Why it is still worth doing alone:* it is the operation people reach for
hourly, and it is the foundation the next stages rewrite rather than replace.

**Stage 2 — Named assemblies.**
A selection can be SAVED as a named assembly (a "frame type A", a "stair
flight") into the project. The assemblies list is a panel; placing one is a
pick in the viewport. At this stage a placement is still a copy — the
assembly is a template, not a live link.

*Why this before instances:* it separates the two hard problems. Naming and
placing is a storage and UI problem; keeping placements in step is a model
problem. Solving them together is how both get solved badly.

**Stage 3 — Instances, with a one-way link.**
A placement remembers which assembly it came from. Editing the assembly
offers to update its placements; the offer lists them and what will change,
and each placement can be detached. One way on purpose: editing a placement
does not change the assembly, because "which of eight floors is the truth" is
a question with no good answer and a reader who wants that can detach, edit
and re-save.

*The hard part, stated:* a placement whose nodes were welded to the structure
around it cannot be replaced wholesale. So an instance update is a diff, not a
delete-and-re-place, and nodes shared with anything outside the instance are
kept and re-used. This is the reason stage 3 is a stage and not a flag.

**Stage 4 — Parametric assemblies.**
An assembly with named dimensions (span, height, bays), so "frame type A" at
6 m and at 8 m are one thing. This is where the generators and the assemblies
converge: a generator IS a parametric assembly with a hard-coded shape, and
the two should end up as one mechanism.

### What has to exist first

**Merge coincident nodes.** It was the first item in the previous version of
this document and it is still first, and copy-paste is why: two nodes in the
same place analyse as two nodes, so a pasted floor sitting on the one below is
a structure that is cut where it looks joined — with no visible symptom, a
solve that succeeds, and results that are wrong. Every stage above makes this
easier to trigger. It must land before stage 1 ships.

---

## 4. Other functions worth building

Ordered by value per unit of work, and each with the reason it earns its place
rather than a description of what it does.

**Merge coincident nodes** — see above. Not optional.

**Divide a member into N.** The only way to put a node in the middle of a beam
today is to delete it and draw two. Needed constantly for load application
points and for meshing a slab edge.

**Mesh a shell region.** Shell results are only as good as the mesh, and PRO
draws one quad per plate as authored. The plate contour work makes this
visible: the field is smooth now, but on a 2 × 2 raft it is smooth over four
elements. A "divide this shell into n × m" is the single largest improvement
available to the accuracy of the concrete design that reads those stresses.

**Move / rotate / mirror a selection by a typed transform.** The three
operations every structure needs and none of which exist. Mirror is worth
particular attention because symmetric structures are most of what gets built,
and mirroring requires deciding what happens to supports and to asymmetric
loads — state it rather than guess.

**Snap indication in the viewport.** A marker on what the next click will
attach to, and a modifier to suppress it. Cheap, and it converts the snapping
that already exists from a source of surprise into a tool.

**Select by property.** "All members with section IPE 300", "all shells
thinner than 200 mm". Once selection drives operations (§2b) this becomes the
way large models are edited at all.

**A node/member numbering that survives editing.** Ids are the address for
everything typed, and today deleting a member renumbers nothing but leaves
gaps that make a table hard to read. Worth a decision, not necessarily a
change.

**Load a whole storey at once.** Surface loads are applied per shell. A
building has floors, and the floor is the unit a reader thinks in.

## 5. What I would not build

**A full CAD line/arc/trim toolkit.** The DXF importer is the answer for
drawing-shaped work, and every hour spent reimplementing AutoCAD badly is an
hour not spent on the structural operations above, which no CAD program does
at all.

**Two-way instance links** (see §3, stage 3).

**A separate "modelling mode".** The lesson from Educational is exactly this
one: a mode is a claim that the work is different, and it makes the reader
leave in order to check something. Drawing belongs in the stage where the
model is.

---

## Appendix — evidence

| Claim | Where |
|---|---|
| PRO creates geometry only through tables | `ProNodesTab.svelte:173` |
| The viewport implements click-to-create nodes | `Viewport3D.svelte:780` |
| …and two-click members | `Viewport3D.svelte:2262` |
| PRO's ribbon only arms `select` and `pan` | `ProRibbon.svelte:266`, `:326` |
| The panel gutter is now the panel's | `ProPanel.svelte`, `.pro-content` |
| Repeat decides what a copy carries | `lib/model/array-copy.ts` |
| A pure-shell model solves | `engine/__tests__/pure-shell-model.test.ts` |
