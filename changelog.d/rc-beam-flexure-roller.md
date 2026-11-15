### BREAKING (results)

#### The CIRSOC 201 flexure example is simply supported (2026-11-15)

The bundled example `rc-beam-flexure` gave its right support a plane type, which a PRO model, solved in space, reads as fully fixed: the beam the CIRSOC 201 flexure post calls simply supported was solved clamped at that end (−92.5 kN·m over the support, +52.0 kN·m in the span). Its right support is now a roller declared by its restraints, free along the beam and holding the vertical, the transverse translation and the twist: +92.5 kN·m at midspan and no end moments. Only the example changed; a model saved from it gives the same numbers.
