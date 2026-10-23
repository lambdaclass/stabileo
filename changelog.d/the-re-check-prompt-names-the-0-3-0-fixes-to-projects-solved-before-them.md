### Fixed
#### The re-check prompt names the 0.3.0 fixes to projects solved before them (2026-10 audit, V6-02)

Solves have been stamped with results version 1 since #328, which is deployed; the fixes merged
with 0.3.0 after it (#530: SA-2026-013…017) were registered at version 1 as well, so a project
solved on a build in between opened as current and was never told that its curved-shell, arc,
3D plastic-collapse, cable or soil-spring results had moved. Those entries are now at results
version 2 (`currentResultsVersion` 2), with the one the registry lacked for an app workflow:
member temperature loads (#407, FR-4, SA-2026-019; feature `memberThermalLoads`). The 3D
material-nonlinear yield surface (SA-2026-020) stays out: no screen of the app runs that solver.
A project solved on 0.3.0 itself also carries version 1 and is shown these entries once more.
`results-version.test.ts` pins each version's entries, so adding one to a version already on main
fails, and `docs/verification/PROVENANCE.md` states the rule. The committed `.ded` fixture is
restamped at version 2. (Version 2 was taken on main first, by #582 and #597; these entries share
it — a build stamping 2 already carries the five fixes, so it is never shown them, and a project
stamped 1 is shown every entry that followed.)
