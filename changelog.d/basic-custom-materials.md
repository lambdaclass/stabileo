### Added
#### Basic: new and edited materials go through one form (2026-11-22)

In Basic, "+ Add material (custom)" on the Materials tab opens a form with name, E, Poisson's
ratio and unit weight, plus yield stress and thermal expansion in a section that starts closed and
shows their values in its header. The form refuses the same values PRO's hand-entered material
refuses (E ≤ 0, ν outside (−1, 0.5), a negative unit weight, fy ≤ 0, α outside (0, 100]·10⁻⁶/°C)
with the same messages, and the pencil on each row edits a material with it. The button used to add
a copy of steel with no form, and the inline properties row took any number, including ν = 3.
Deleting a material that members still use shows a message instead of a browser alert. On a phone
the form fits the sheet and every control is at least 44 px tall.
