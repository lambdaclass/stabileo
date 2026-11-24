# Refuse ambiguous diagram stations

A peak can have a resolved ordinate on the original load interval while its normalized station rounds to a different section. In that case, a diagram can still show the analytic peak and a point query at the reported station refuses. The query tests the force change on the original interval. It accepts a station that reproduces the peak.

Planar and spatial envelopes and beam station extraction check for a peak and a concentrated jump from distinct sections at the same normalized station before evaluating either side. This prevents a post-jump force entering a left-hand envelope ordinate. When the jump and peak are at the same physical section, the two limits are still evaluated separately.

Browser diagrams refuse distinct peak ordinates at one normalized coordinate. Interior jumps continue to carry two labelled limits. These checks apply to linear and second-order force records. Member equilibrium and the analytic ordinates of resolved cuts use the existing formulas.
