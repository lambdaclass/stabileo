### BREAKING (results)

#### 3D plastic collapse refuses a frame member without a usable plastic moment (2026-11-05)

- SA-2026-045, fix #1525 (#1526): the 3D plastic solve (`solve_plastic_3d`, the PRO pushover), its certificate and its bundle treated a frame member whose plastic moment about either axis was missing, infinite or zero as one that never yields: a section missing from `sections`, a section without dimensions and with an inertia at or below 10⁻²⁰, or a zero Mp override. On the 3D portal sample (`verify/samples/plastic-3d-portal.input.json`), a column on such a section moved the collapse factor from 31.865 to 192.816 (6.05×), still reported as a mechanism and certified. A negative override was used as its absolute value. Both are now refused, naming the element and its section (`plastic_capacity_missing`), and the app says so in the reader's language. Models whose members all have positive plastic moments give the same numbers.
