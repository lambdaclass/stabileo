### Fixed
#### Refuse non-finite support springs and fully cancelled combinations (2026-11-19)

Cable and soil–structure interaction now refuse non-finite spring stiffness before encoding the input. Load combinations are refused when repeated case factors cancel every nonzero contribution (#2292).
