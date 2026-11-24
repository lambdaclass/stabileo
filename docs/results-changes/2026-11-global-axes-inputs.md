# Global axes input conversions (2026-11-16)

The global coordinate-frame editor, introduced by #1986, is disabled in the production build. When enabled, it converts inputs and displayed quantities at the boundaries of the application. The analysis still consumes the canonical model coordinates.

## Affected input

- An explicit plane model with a zero depth coordinate remains a plane model on framed model-code and workbook exchange. Framed workbook columns retain the distinction between translation and rotation stiffness or settlement.
- Model-code spring-curve displacement and force coordinates transform together and stay ordered by displacement. Member-local DOF values stay local, while geometric support normals follow the declared global axes. A canonical asymmetric soil branch is still refused by the existing engine validation.
- Workbook direction names and factors are inverted when imported. Long-form member loads keep their components, case and loaded span. The standalone gravity row retains its all-loads meaning independently of case rules. A workbook with an invalid declared frame or unsupported load record is refused before it can replace the current model.
- Projected and global load placement applies the same signed component conversion. Coordinate edits, pending transforms and placement keep their physical location as the display frame changes.

Results displayed in a user frame preserve the quantity being reported. Signed influence bounds exchange minimum and maximum when negated. Axial moments use the rotation convention of the displayed frame. Component magnitudes, including the storey-shear magnitudes calculated by Stabileo, retain their sign-independent values.

## Verification and existing models

The exact canonical solver inputs and results from origin/main at `f8ae1deb2` were captured for a cantilever, a second-order portal and a 3D portal. The integration compares the linear and nonlinear WASM results, excluding timing measurements, with the switch both off and on. Workbook round trips additionally exercise 2D and 3D loads and support data through signed frame permutations.

These changes correct inputs and presentation in the experimental #1986 feature. They do not change native engine code or solver tolerances. If you used an experimental build to enter framed model code or workbook inputs, reimport the original inputs to obtain the corrected canonical model.
