### Fixed
#### Steel shear checks with no shear area are not evaluated instead of passing (2026-11-02)

AISC 360 G2 with no `aw` reported a shear ratio of 0 and passed, certified, under any shear
(SA-2026-025). EN 1993-1-1 6.2.6 with no `av` took Av = 0.5·A, 57 % above the shear area of an
HEB 300 (SA-2026-026); it now derives Av from the section geometry by 6.2.6(3), and without
geometry the shear check is not evaluated. Both concern the engine and WASM API only: the app
always sends the area. Re-check API results for members sent without it (#1234).
