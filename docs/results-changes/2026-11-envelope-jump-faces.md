# Both faces in member force envelopes

Critical-station workbook envelopes use a shared station set for each member.
It includes the physical load and piece boundaries and stationary points of
each reported component. When a force or moment jumps, the Envelope sheet
identifies the left and right faces in its `face` column. Each face is evaluated
in every selected source, and the minima and maxima name their governing
sources. Two nearby physical stations remain distinct when their normalized
positions can represent them.

A cantilever loaded transversely in two separate combinations at different
positions has a jump at the first load position in one combination. The
second combination still has shear on both sides of that station. Previously,
the worksheet reported only the left face from the combination with the
first load. The fixed worksheet reports both faces and the second
combination can govern the right face.

Spatial combination envelopes carry the exact cut locations and face identity
from the engine when split pieces are reassembled. The app refuses an envelope
when distinct critical cuts would coincide after mapping them to the parent
member. This also applies when recalculating an envelope from saved or applied
piece results.

Re-export critical-station workbooks for affected projects and recompute any
affected spatial combination envelopes. See #2226.

All sources use the physical distance of a cut, including any rounding
residual from adding a piece offset. Consider a cut at a piece-local
coordinate of 0.24999999999999992 with a piece offset of 1. A second
combination with local shear 16 + 2⁵⁴(x − 0.25) contributes 14.5 at the cut.
Using the rounded normalized coordinate can give 18 and select that source
over the actual governing shear of 16.
