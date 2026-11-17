# The CIRSOC 201 flexure example is simply supported

## The CIRSOC 201 flexure example is simply supported

The example `rc-beam-flexure`, the 5 m beam the CIRSOC 201 flexure post embeds, gave its right
support the type `rollerZ`, a support of plane models. A PRO model is solved in space, and
`supportDofs3D` reads a type it does not know there as fully fixed, so the beam described as
simply supported was solved clamped at its right end: −92.5 kN·m over that support and
+52.0 kN·m at 1.875 m under 1.2D + 1.6L, a propped cantilever.

The right support is now a roller declared by its restraints: free along the beam, holding the
vertical and the transverse translation and the twist, so neither end leaves a mechanism. The
beam is simply supported: +92.5 kN·m at midspan (29.6 kN/m · 5²/8), no end moments, 74 kN of shear
at each support. Only the bundled example changed; a model saved from it keeps its own support and
gives the same numbers as before.
