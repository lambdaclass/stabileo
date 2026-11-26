# Constraint projection in XY

Basic solves rotate authored XY constraints to the solver's XZ convention before classifying and projecting them. An equation coupling `ux` and `uy` stays in plane, and an eccentric connection's Z offset is treated as normal to XY. The solve refuses a normal offset when either in-plane translation is tied and accepts the separated equations when both are released. Linear, combination and nonlinear analysis use the same projection.

Slicing and flattening store constraints in the same XY axes as the new geometry. Older planar snapshots without a saved plane could contain either original XY constraints or the XZ constraints written by older slicing and flattening. Restore reports the first axis-sensitive constraint when that distinction is ambiguous. Constraints that are independent of the distinction still restore.

A rigid link with an omitted or empty degree-of-freedom list uses the spatial default of tying all translations. This default includes the Y and Z translations. Restore checks it for sensitivity to the saved axes just as it checks a link that lists those translations. The projected planar link continues to tie the two in-plane translations.
