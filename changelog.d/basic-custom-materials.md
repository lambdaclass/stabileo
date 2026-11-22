### Added
#### Basic: materials you define yourself, from the material catalogue (2026-11-22)

In Basic, the material catalogue has a last tab on the right, "Define custom material", set apart
from the categories the way "Define amorphous section" sits in the section picker. It opens a form
with name, E, Poisson's ratio and unit weight, plus yield stress and thermal expansion in a section
that starts closed and shows their values in its header. The form refuses the same values PRO's
hand-entered material refuses (E ≤ 0, ν outside (−1, 0.5), a negative unit weight, fy ≤ 0, α outside
(0, 100]·10⁻⁶/°C) with the same messages. "+ Add material" on the Materials tab opens the catalogue
to add a new material, and the pencil on each row opens the form to edit one. The button used to add
a copy of steel with no form, and the inline properties row took any number, including ν = 3.
Deleting a material that members still use shows a message instead of a browser alert. On a phone
the custom tab and every control of the form are at least 44 px tall and fit the screen.
