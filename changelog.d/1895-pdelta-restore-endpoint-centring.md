### BREAKING (results)

#### Restore equivalent nodal axial forces in endpoint geometric stiffness

Undo the incorrect solver centring in unmerged commit aca7eb07a while retaining its advisory-table and date changes (#1329, PR #1895). Include every span and point load in N_delta = (n_start + n_end)/2 - (F_i - F_j)/2. A base point load leaves the cantilever interior compression intact; an opposing tip point load cancels the tip thrust. Eight corrected 2D/3D frame/truss regressions fail on that commit and pass with the restored code, matching both closed forms and displacement-based assembly. Correct endpoint descriptions in the results-change write-up, six-language registry entry and existing draft SA-2026-055. The endpoint-centring regression existed only on this unmerged branch, never on main or in a release, so no separate advisory is needed. Application displacement assembly already handles these endpoints correctly.
