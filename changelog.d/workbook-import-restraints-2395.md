### Fixed

#### Refuse spreadsheet errors and ambiguous support and gravity inputs (2026-11-20)

Excel import blocks spreadsheet error cells on model sheets and rejects restraint flags that conflict with the named support. Complete explicit spatial restraint masks are preserved. The SelfWeight sheet requires a unitless `factor` header and rejects percentage and other unit suffixes (#2395).
