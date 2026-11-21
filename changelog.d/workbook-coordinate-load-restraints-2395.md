### Fixed

#### Reject ambiguous workbook coordinates and loads and preserve explicit restraints (2026-11-20)

Excel import blocks malformed coordinate unit headers and populated columns that do not apply to the load type on that row. Project workbooks preserve explicit spatial restraint flags in workbook axes before the model has been solved (#2395).
