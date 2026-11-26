### Fixed

#### Export workbooks for members with offsets

Project workbook export uses the analysis geometry for offset members so the self-weight check measures their physical line of action. (#2586)

### BREAKING (results)

#### Apply one gravity load to matching rafter gaps

Multiple rigid roof attachments that identify the same uncovered rafter intervals produce one tributary-width load. Conflicting intervals still block load generation. (#2586)
