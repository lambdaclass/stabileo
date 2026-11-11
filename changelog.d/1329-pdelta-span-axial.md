### BREAKING (results)

#### P-Delta integrates the axial force distribution under span loads (2026-11-10)

2D and 3D P-Delta now integrate the varying axial force under distributed and point loads along frame members, including geometric end forces and the certified model. The mean-force stiffness could understate amplification and report stability above the discrete critical load (#1329). In the measured one-element column, sway changes from 2.0562 to 3.2470 mm (continuum 3.3352 mm), and the base moment from 7.0843 to 10.1658 kN·m (continuum 10.3961 kN·m). The `PD-SPAN-AXIAL` warning is removed. Re-run affected P-Delta analyses and derived checks. See `docs/results-changes/2026-11-pdelta-span-axial.md` and draft advisory `docs/advisories/SA-2026-055-pdelta-span-axial.md`.

The advisory is listed as a high-severity pending draft in all six blog languages; no merge, release or deployment is claimed.
