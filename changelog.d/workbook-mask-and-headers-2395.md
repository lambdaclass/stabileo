### Fixed

#### Preserve workbook restraint axes and require valid headers (2026-11-20)

Project workbooks write explicit restraint flags in their declared axes and keep blank flags blank. Excel import blocks incomplete rotational spring unit suffixes and populated model sheets that lack required headers, including headerless sheets with just one load (#2395).
