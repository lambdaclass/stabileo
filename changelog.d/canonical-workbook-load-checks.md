### Fixed

#### Check canonical loads in workbook import tests

Workbook tests verify that planar nodal loads have one transverse component after import, while spatial loads retain independent force components. Duplicate and out-of-plane load checks still exercise the original refusal cases.
