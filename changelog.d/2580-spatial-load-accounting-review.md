### Fixed

#### Preserve valid line loads through spatial solve preparation

The load check follows the original member when the solver divides it into pieces and accounts for cancellation when resolving a line load in local axes. This prevents false refusals on skew frames, variable members and planar workbook exports. (#2580)
