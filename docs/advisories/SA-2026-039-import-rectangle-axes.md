# SA-2026-039: Excel and IFC imports swapped Iy and Iz of rectangles and tubes (4 times too flexible, or too stiff)

| | |
|---|---|
| Severity | High |
| Status | Draft |
| Issue | [#532](https://github.com/lambdaclass/stabileo/issues/532) (leftover of SA-2026-029) |
| Fix | #1310 |
| Affected versions | every release (desktop-v0.1.0-alpha.1 to 0.4.0) and the live site until this fix: Excel `b`/`h` sections since the importer landed (2026-09-09, 8bcd39ca3); IFC sections named `HxB` or `HxBxT` and the no-profile fallback since 2026-03-04 (b93ada5b8); IFC rectangles drawn in the file since 2026-10-18 (1f8432385) |
| Re-check registry | none: an imported model keeps the section values it was saved with |

## Affected features

- **App: Excel import**, a section given by `b` and `h` instead of a catalogue name or explicit
  inertias.
- **App: IFC import**, a rectangular profile drawn in the file (`IfcRectangleProfileDef`), a
  section named like `500x200` (solid) or `200x100x5` (tube), and the fallback section used when
  a file names no profile. Catalogue profiles named in the file (IPE, HEB…) were not affected.
- Excel sections given by a catalogue name, or with explicit `Iy` and `Iz`, were not affected.

## What was wrong

The app's sections keep the inertia about the horizontal axis (bending in the depth h) in `Iy`
and the one about the vertical axis in `Iz`; every solve and design reads `Iy` for a beam bending
in its plane. These importers wrote b·h³/12 into `Iz` and h·b³/12 into `Iy`, so every rectangle
and tube bent about the wrong axis: a section deeper than wide (h > b) about its width, too
flexible by the ratio of its two inertias, and a section wider than deep (b > h) about its depth,
too stiff by the same ratio. For a solid rectangle that ratio is (h/b)²; for a tube it is smaller
(about 3 for a 200 × 100 × 5 tube). The no-profile fallback (`Default`, an IPE 200-like I
section) came in with only its strong-axis inertia, in `Iz`.

| 0.20 × 0.40 m concrete cantilever, 3 m, 10 kN at the tip | Tip deflection |
|---|---|
| PL³/(3E·bh³/12) | 3.375 mm |
| Excel import before the fix | 13.5 mm (4 times: (h/b)²) |
| Excel import after the fix | 3.375 mm |
| The same member as 0.40 × 0.20 m (b > h), before the fix | 3.375 mm instead of 13.5 mm (4 times too stiff) |

Deep members came out too flexible and wide ones (flat beams, wall-like columns, planks) too
stiff: deflections and drifts were too small for the wide ones (unconservative), buckling loads
too high, and indeterminate frames shared their forces by the wrong stiffnesses, so some members
were designed for less than they carry.

## How to tell if your results are affected

You imported an Excel workbook whose sections give `b` and `h` without `Iy` and `Iz`, or an IFC
file with rectangular or tube profiles, or an IFC file whose members got the section `Default`,
and used the results.

## Fixed in

Both importers write b·h³/12 into `Iy` and h·b³/12 into `Iz`, as the app's own section builders
do. Tests: `web/src/lib/excel-import/__tests__/parse.test.ts`,
`web/src/lib/excel-import/__tests__/import-into-pro.test.ts` (the cantilever above),
`web/src/lib/ifc/__tests__/ifc.test.ts`.

## Workaround

Give `Iy` and `Iz` explicitly, or pick the section in the app after importing.

## What to do with results you already have

Open the section properties of each imported rectangular or tube section and compare them with
its dimensions: `Iy` must be b·h³/12 and `Iz` h·b³/12 (for a tube, the outer minus the inner
rectangle). If they are the other way round, whichever of b and h is larger, swap them (or
re-import on the fixed version) and solve again. A square section is not affected. For the
section `Default`, set `Iy` = 1.943e-5 m⁴ and `Iz` = 1.42e-6 m⁴.
