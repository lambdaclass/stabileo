### Fixed

#### Block invalid workbook self-weight member selectors

Workbook import reports fractional, out-of-range, and missing member IDs as blocking errors before replacing the current model. Member selectors use space-separated decimal digits, so fractional text cannot round onto an existing member. (#2565)
