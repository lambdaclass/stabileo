### Fixed
#### Refuse non-finite support springs and fully cancelled combinations (2026-11-19)

Cable and soil–structure interaction now refuse non-finite spring stiffness before encoding the input. Load combinations are refused when repeated case factors cancel every nonzero contribution or round entirely to zero on a route that keeps the original factors (#2292).
