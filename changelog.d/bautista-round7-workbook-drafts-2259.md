### Fixed
#### Preserve pending geometry and workbook loading across displayed axes

- Node, transform, diaphragm, constraint and underlay drafts keep their physical meaning when axes change. Member-local supports retain their own DOFs. Supported workbook LoadData loads round trip forces, moments, partial extents and load cases; invalid or unsupported load groups are reported. The third landing mode animates at its displayed relative frequency (#2259).
