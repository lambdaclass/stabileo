# PRO's modelling tools: what is there, what is missing, what to build next

Written while reworking PRO's UI. It is a proposal, not a decision record —
the one thing in it that is already built is the repeat tool, and it is here
because it is the argument for the rest.

## How the tools stand today

PRO draws one thing at a time. Nodes, members and shells are placed
individually; supports and loads are applied to what is selected; generators
replace the whole model from a parameter form. Between "place one" and
"generate everything" there is nothing, and that gap is where most of the work
in a real model actually lives.

The clipboard is the only thing in the gap, and it pastes one copy at a fixed
offset — a metre across in 2D, three metres up in 3D.

## What was built

**Repeat selection** (`lib/model/array-copy.ts`, `ProRepeatPanel`). A count and
an offset instead of a fixed step, and — the part that is not copying — the
members BETWEEN copies. Repeating a floor plan gives you floors and no
building: the columns span from one copy to the previous one, so they do not
exist in the thing being copied and have to be created.

It is deliberately narrow. It does not weld coincident nodes, does not mirror,
and does not rotate. Each of those is a decision with consequences, and the
panel says what it did not do rather than doing it quietly.

## What to build next, in the order I would build it

### 1. Merge coincident nodes

The repeat tool's stated limitation, and the one that bites first. Two nodes in
the same place analyse as two nodes: the structure is cut where it looks
joined, and the symptom is a mechanism or a wildly wrong deflection with
nothing visibly wrong on screen.

The tool is a tolerance and a preview: "142 nodes within 5 mm of another — join
them?", with the pairs highlighted before anything happens. The hard part is
not finding them, it is deciding what happens to what was attached to the one
that disappears — supports, loads, member ends — and that is exactly why it
should be an explicit action with a report rather than something the repeat
tool does on its own.

### 2. Mirror

A building is very often symmetric about one plane, and drawing half of it is
half the work. Mirror needs the same machinery repeat already has (map old
nodes to new, remap members) plus a plane, and one real subtlety: a mirrored
member's local axes flip, which matters for anything that has been given a
roll angle or an explicit local-y.

### 3. Divide a member into N

Placing a node on an existing member already exists as an auto-split. What does
not is "this beam, into four" — which is what anyone does before applying a
pattern of point loads, or before meshing a shell edge to match.

### 4. Extrude a line of nodes into members

The inverse of divide: select a chain of nodes, give a direction and a length,
get a member from each. It is repeat with `count: 1` and `link: true`, which is
a sign the two belong in one panel rather than two.

### 5. Move by a typed vector

Dragging is now available for nodes (Basic's Move panel). What is missing is
typing: "move this selection by (0, 0, 3.2)". Dragging is for approximate
work; a structure is not approximate, and every model ends with a handful of
things that need to be exactly somewhere.

## Two interface changes worth making alongside

**The tools belong in one place.** Repeat landed in Draw because it is drawing
in bulk. Merge, mirror, divide and move-by-vector are the same kind of thing —
they act on a selection and change geometry — and five separate ribbon
commands would scatter them. A single "Modificar" group beside Draw, with the
selection as its subject, is the shape this wants.

**Every one of them needs a preview and a count.** The pattern the repeat panel
uses — say what is selected, say what will happen, say what happened — is not
decoration. These tools change many things at once, and an undo that restores
four hundred elements is not a substitute for knowing what you were about to
do. Each should report before and after in the same sentence the repeat panel
does.

## What I would not build

**A parametric history.** Every operation recorded, replayable when an input
changes — the thing a CAD kernel does. It is the correct long answer and the
wrong next step: it changes what a model IS, and every tool above has to exist
either way. Build them directly first; if the history arrives later, they
become its operations.
