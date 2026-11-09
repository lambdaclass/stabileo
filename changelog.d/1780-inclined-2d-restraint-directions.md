### Fixed

#### 2D inclined supports count restraints in a common frame (2026-11-08)

Inclined 2D support normals and positive global-axis springs now contribute their joint directional rank to the diagnostic kinematic degree. Independent directions that shared an array slot were undercounted; coincident directions in different slots were counted twice. A relative component tolerance keeps periodic and near-cardinal normals from gaining a spurious direction through floating-point roundoff. The displayed degree, classification and diagnosis can change. Solve acceptance uses input validation and stiffness rank independently of this count; assembly and numerical static solutions are unchanged. This correction to PR [#1780](https://github.com/lambdaclass/stabileo/pull/1780) is not released or deployed.
