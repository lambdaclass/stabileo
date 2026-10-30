### Changed
#### Copy and paste in Basic work as in PRO: what is selected, placed with a ghost (2026-10-29)

In Basic 2D and 3D, Ctrl+V pasted at once, one metre over (or three metres up in 3D), on top of the
original, and Ctrl+C took the members between copied nodes too. Copy now takes what is selected:
nodes alone come without members, a member brings its two nodes. Ctrl+V shows the copy as a ghost
that follows the pointer, snapping to nodes and the grid, with the placement bar of PRO above the
model: a click places it, Shift+click places and keeps going, R turns it, F mirrors it, Tab changes
the anchor, the bar takes exact coordinates (X and Z in 2D) and Esc cancels. Ctrl+Shift+V pastes in
place. Ctrl+X removes the selection and the nodes nothing else uses, as in PRO.

Beside the delete button there are now copy and paste buttons, in the options bar on a desktop and
over the model on a phone: copy shows while something is selected, paste once something was copied.
On a phone the ghost follows the finger and lifting it places the copy.
