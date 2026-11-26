# Recognize a proven mechanism during planar plastic collapse (2026-11-26)

PR #2608's structural proof found free translations at the joint left by axial yield in the generated planar truss case `truss#39`. The kinematic result classified the proven motion as indeterminate stiffness rank. The step-by-step plastic solver stopped with a refusal before evaluating collapse.

Planar and spatial kinematic checks now report a known mechanism when the structural proof establishes a free translation or a frame swing. They retain its joint and diagnostic. A model already free to move before yielding still cannot start plastic analysis. Rounding that leaves rank indeterminate still blocks the affected solves.

In the minimal truss replay, two collinear bars hold the joint horizontally. A third bar supplies the entire vertical force. If its axial capacity is (N_p) and the reference vertical force has magnitude (P), joint equilibrium requires (N = lambda P) in that bar. Its yield removes vertical stiffness and permits nonzero load work. The resulting collapse factor is (lambda = N_p/P). This change restores the collapse result through the existing yield and mechanism checks.
