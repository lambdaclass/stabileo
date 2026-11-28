# Effective flange width of an individual near-level beam

The sheets integration changed the fallback span used when measuring a concrete beam flange. An individual beam accepted as horizontal can have a small difference between its end elevations. Using its spatial length could widen an edge or interior flange when the span term controlled. The ordinary design now carries the plan length from the slab-side geometry. An explicitly grouped physical beam still uses the summed spatial member lengths.

The integration-parent edge and interior witnesses both reproduce the difference at the level acceptance limit. Both already match the corrected results on main. A model saved from the integration branch with an ungrouped near-level concrete beam sharing both ends with a slab should have its concrete design run again. Level beams and declared physical spans keep their original values.
