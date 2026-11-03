# SA-2026-039: Excel and IFC imports gave rectangles and tubes their weak-axis inertia for bending in depth

| | |
|---|---|
| Severity | Medium |
| Status | Draft |
| Issue | [#532](https://github.com/lambdaclass/stabileo/issues/532) (leftover of SA-2026-029) |
| Fix | #1310 |
| Affected versions | every release with the Excel importer or the IFC importer; not bisected |
| Re-check registry | none: an imported model keeps the section values it was saved with |

## Affected features

- **App: Excel import**, a section given by `b` and `h` instead of a catalogue name or explicit
  inertias.
- **App: IFC import**, a rectangular profile drawn in the file, a section named like `500x200`
  or `200x100x5`, and the fallback section used when a file names no profile.

## What was wrong

The app's sections keep the inertia about the horizontal axis (bending in the depth h) in `Iy`
and the one about the vertical axis in `Iz`; every solve and design reads `Iy` for a beam bending
in its plane. These importers wrote b·h³/12 into `Iz` and h·b³/12 into `Iy`, so a beam bent about
its width.

| 0.20 × 0.40 m concrete cantilever, 3 m, 10 kN at the tip | Tip deflection |
|---|---|
| PL³/(3E·bh³/12) | 3.375 mm |
| Excel import before the fix | 13.5 mm (4 times: (h/b)²) |
| Excel import after the fix | 3.375 mm |

Deflections and drifts came out too large, and indeterminate frames shared their forces by the
wrong stiffnesses, so some members were designed for less than they carry.

## How to tell if your results are affected

You imported an Excel workbook whose sections give `b` and `h` without `Iy` and `Iz`, or an IFC
file with rectangular or tube profiles, and used the results.

## Fixed in

Both importers write b·h³/12 into `Iy` and h·b³/12 into `Iz`, as the app's own section builders
do. Tests: `web/src/lib/excel-import/__tests__/parse.test.ts`,
`web/src/lib/excel-import/__tests__/import-into-pro.test.ts` (the cantilever above),
`web/src/lib/ifc/__tests__/ifc.test.ts`.

## Workaround

Give `Iy` and `Iz` explicitly, or pick the section in the app after importing.

## What to do with results you already have

Open the section properties of each imported rectangular or tube section: if `Iz` is larger than
`Iy` for a section deeper than it is wide, swap them (or re-import on the fixed version) and solve
again.
