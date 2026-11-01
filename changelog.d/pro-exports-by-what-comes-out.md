### Changed
#### Exports by what comes out, with the format chosen in the dialog, in PRO and Basic (2026-10-28)

Project → Export had a button per format (Excel, CSV, PDF report, DXF, IFC, SVG, PNG, JPG). It now
has one per content: Results… (Excel or CSV), Calculation report… (PDF, Word or HTML), Drawings…
(DXF, SVG, PNG or JPG, one row of formats across the DXF and the picture dialogs, each keeping its
own options) and BIM model (IFC). Each dialog shows its format first. The calculation report no
longer offers a workbook or CSV of its tables: the results as data are the Results export. The
dialogs, their contents and the files they write are otherwise unchanged.

Basic does the same: Results… (Excel or CSV, in a small dialog where it used to download at once),
Calculation report… (PDF, Word or HTML; Word and HTML were not offered before) and Drawings… (SVG,
PNG or JPG; JPG is new). In both modes the export buttons sit one per row, one line high, and the
spreadsheet import is a wide button with its template beside it.
