# The default covers are CIRSOC 201-2025 Table 20.5.1.3.1's (2026-11-16)

Results-change entry `default-covers-table-20-5-1-3-1`.

`defaultDesignData` gave 25 mm of clear cover to every kind of element. CIRSOC 201-2025 Table
20.5.1.3.1, for elements under execution control, asks beams and columns for 35 mm (and at least
db + 5 mm) to the main bars and 25 mm to the stirrups, slabs and walls for 25 mm (at least
db + 5 mm), and the base of a footing on its lean concrete for 55 mm. A beam with 25 mm to its Ø8
stirrups has its main bars 33 mm deep, under the table. The defaults are now the table's for the
default bars, rounded up to 5 mm:

| Kind | Before | Now | From the table |
|------|--------|-----|----------------|
| Beam | 25 mm | 30 mm | max(25; 35 − 8; 25 + 5 − 8) = 27 mm to a Ø8 stirrup, Ø25 the largest beam bar |
| Column | 25 mm | 30 mm | max(25; 35 − 8; 32 + 5 − 8) = 29 mm, Ø32 the largest column bar |
| Slab | 25 mm | 25 mm | max(25; 16 + 5), Ø16 the largest mesh bar |
| Wall | 25 mm | 25 mm | max(25; 12 + 5) |
| Footing | 25 mm | 55 mm | row (a) |

The CIRSOC preset of the design-data panel gives the same values, and now reads each family's own
bars: a slab no longer takes 40 mm from the Ø32 the columns may use.

## What moves

Only projects that never stored their covers: a project's design data, once written, keeps the
covers it holds (`migrateDesignData` reads them back as saved), so the change is told only where
the snapshot has no stated covers (`defaultDesignCovers`). In those projects every beam and column
has 5 mm less effective depth: the flexural and shear capacities of the CIRSOC 201 code check drop
by about 1 to 2 % and the ratios rise as much. In the results corpus, five RC models and the
footing model's frame move that way (`design.rc`, `design.member`); no verdict turns to fail, and
five checks of the diagnostic model go from ok to warn. A new footing takes 55 mm; footings
already in a project keep the cover they were placed with.

**What to re-check:** concrete projects that never set their covers in the design data.

While the unified PRO plates build switch is off, the production build keeps main's 25 mm, so the
committed snapshots stay main's; these numbers move with this entry when the switch turns on.
