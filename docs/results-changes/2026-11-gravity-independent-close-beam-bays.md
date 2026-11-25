# Restore gravity on independent, explicitly selected beam bays

PR #2512 refused the #2172 snow model because the projected bay footprints
overlap and their 49 mm separation falls within the 50 mm roof-cover cutoff.
On main, both flat bays retain their panel loads and are classified as roofs.
The axis-aligned and rotated witnesses also retain their snow resultants and
member response after subdivision.

Explicit panel selection now recognizes distinct flat levels when the bays
belong to disconnected beam frames in a model without shells or constraints.
Their physical elevations must clear the planner's existing 1 mm level
tolerance. The roof-cover check continues to use its existing 50 mm cutoff.
Close overlaps under automatic selection, in connected frames, in models
with shells or constraints, or with a nonflat bay still require the existing
deck-separation proof.

In the rectangular dead-load control, the two 10 m by 6 m bays each receive
60 kN at 1 kN/m². The generated actions give a combined vertical reaction of
120 kN in both 3D linear and P-Delta WASM analysis. The original snow case
retains its pressure and remeshing assertions.
