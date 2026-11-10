### BREAKING (results)

#### Consistent teaching P-Delta integrates axial span loads (2026-11-10)

The consistent second-order teaching solver now integrates varying axial force under member span loads in stiffness, end forces and reactions, matching the corrected engine (#1329, PR #1895). Independent cubic integration confirms the teaching cantilever's base moment is 10.490333626707253 kN·m; the previous teaching value was 10.508408979997858 kN·m. Refresh only P-Delta quantities in the PRO 3d-portal-frame and 3d-tower snapshots (144 and 246 values); linear results and every other analysis are unchanged between main and the fixed engine. The recheck notice now includes generated self-weight even without saved member loads. See `docs/results-changes/2026-11-pdelta-span-axial.md` and `docs/advisories/SA-2026-055-pdelta-span-axial.md`.
