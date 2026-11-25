# Preserve precise member diagram stations and sums

Critical workbook envelopes carry the physical distance of a stationary
point through the shared station set. On a 3 m member, a shear peak at
1.75 m has ordinate 3.25 in one source. Another source with shear
(4 + 2^{52}(x - 1.75)) contributes 4 at the same section. The previous
normalized reconstruction sampled it one force unit lower and could name
the wrong governing source.

When reassembling a spatial member, the app rounds the normalized distance
after including the offset sum's rounding residual. With a 1 m offset on a
3 m member, cuts at 0.24999999999999992 m and 0.25 m along the piece have
adjacent normalized positions. Both cuts and their signed faces survive.
The app refuses distinct cuts that still share a normalized position.

The native and browser diagram readers retain the rounding errors of action
terms as separate components until the ordinate is rounded. The six signed
moment contributions (2^{108}, 2^{54}, 1, -2^{54}, -1, -2^{108}) give zero.
A single rounded correction previously gave −1, and the older uncompensated
sum could also discard a nonzero remainder when the actions nearly cancel.

Recompute affected diagrams and combination envelopes and re-export critical
workbooks. See #2226 and #2437.
