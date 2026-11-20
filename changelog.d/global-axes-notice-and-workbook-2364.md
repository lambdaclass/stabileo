### Fixed

#### Scope global-axes recheck notices and refuse ambiguous workbook inputs (#2364)

Global-axes recheck notices require saved evidence of feature use. Workbook import refuses invalid physical load fields in declared frames, duplicate physical columns in those frames, duplicate prescribed rotation columns, and duplicate LoadData or SelfWeight sheets. A refusal preserves the open model.
