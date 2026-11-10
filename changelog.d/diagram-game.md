### Added
#### A game for reading diagrams: one structure, three diagrams, pick the right one (2026-11-10)

`/<locale>/diagram-game/`, also linked from Educational mode, shows a structure with its loads and
three bending moment, shear, axial force or deflected-shape diagrams, one of them right. The wrong
ones come from solving a changed structure (a load moved or reversed, a support or a hinge changed)
or from a classic drawing mistake (the wrong sign, degree or vertex, a missing jump, a moment that
does not vanish at a hinge, a deflection that does not vanish at a support), and the explanation
after each answer says which. Six levels run from a simply supported beam to frames and trusses,
with rounds in the later ones that ask for the diagram that does not match the others. The best
score stays in the browser. The page loads the engine but not the application, so the app's own
bundle does not grow.
