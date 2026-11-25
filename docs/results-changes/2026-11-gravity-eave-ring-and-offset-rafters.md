# Preserve shell loads at framed eaves and refuse ambiguous rafter offsets

The horizontal eave ring of a gable roof can enclose the same projected area as the sloped roof shells. Panel gravity assigns this area to the shells when a single edge-connected pitched shell mesh fills the ring, stays at or above its elevation, and shares its corner nodes. The same deck coverage and area checks apply before assigning loads to either carrier. Gaps, disconnected corners and overlapping carriers that prevent a unique assignment still produce a refusal. The uniform roof pressures remain available when the existing separate check for concentrated roof loads requires manual verification.

When a rigid attachment places a member within the roof structure and its translated axis matches a shell outside the supported deck offset, the planner blocks automatic assignment before falling back to tributary width. Members within the supported offset still use the existing shell coverage check. The planner applies the same rule when previewing, preparing or regenerating panel loads.

Regenerate automatic panel gravity in affected projects. If generation identifies an unresolved rafter offset, assign the area load once by hand.
