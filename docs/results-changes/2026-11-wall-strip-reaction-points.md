# Footing reaction points after mesh and node edits

## Recheck footing reactions after mesh or node edits

Refining a wall could add supported nodes between a strip footing’s original reaction points. The previous design and sizing commands could omit those reactions. The project now resolves each strip against the connected edges at the wall base. A strip ends at its authored endpoints. Independent footing claims separate adjacent spans.

Renumbering could also leave secondary reaction points or a strap endpoint linked to the old node number. Welding could leave a strap linked to the removed node. Check the intended physical points in previously edited files, correct their assignments, rerun the analysis, and regenerate the foundation sizing, checks and documents. Existing numbers in an older file cannot identify a point that has already been incorrectly relabelled.
