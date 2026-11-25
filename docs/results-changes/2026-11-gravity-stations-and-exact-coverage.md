# Preserve gravity transfers through deck stations and exact roof coverage

Regenerate automatic gravity loads in affected panel and width models and
rerun analyses that use the generated actions.

Two independent 10 m by 6 m shells each carry 60 kN under 1 kN/m² of dead
pressure. A common fixed restraint could supply a spurious attachment
station on the earlier PR branch. Together with a separate valid tie, it
caused ownership to suppress one shell and the solved vertical reaction
was 60 kN. Paths ending at that restraint no longer establish deck
continuity through it. The recovered reaction is 120 kN.

Subdividing an eccentric link preserves its displacement between the
attachment stations when all segments carry vertical motion and their
geometry supports the path. A rafter under an offset shell keeps the
shell as its gravity carrier. When offset decks overlap and a uniform
pressure cannot represent the required partial assignment, the planner
refuses the model as it does for a direct link.

Overhead footprints use their actual polygon boundaries, including
holes. Bare beam coverage uses the member centerline and its endpoints.
A point outside an overhead footprint or beyond the end of a member
keeps its roof classification. Existing elevation and headroom rules
continue to apply.

The final area load check compares the input tributary force with the
resultant integrated from the emitted line, nodal and shell actions at
each level, for each full or patterned case. If the forces disagree,
automatic generation refuses and returns no load cases to apply.
