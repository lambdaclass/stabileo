# Refuse ambiguous gravity on bays below shadowed shells

Automatic panel gravity checks a bay's proposed load region against the final owners of any shell previously matched to that bay. If a final shell is within the existing deck separation limit over a shared part of that region, automatic loads refuse with the IDs of the two shells. Preview and apply return the same refusal.

In the review model, a 10 m by 6 m bay shares a footprint with two shells. The lower shell is on the bay plane, and two vertical ties connect it to the upper shell 20 mm above. With 1 kN/m² of superimposed dead pressure, the branch previously assigned 60 kN to the upper shell and 60 kN to the bay beams. The plan now refuses before producing loads. When both attachment stations directly establish the upper shell's connection to the bay, that shell still receives the single 60 kN load.

Regenerate panel gravity for affected projects. If automatic gravity reports overlapping shells, resolve the geometry or assign the common area load once by hand before re-solving.
