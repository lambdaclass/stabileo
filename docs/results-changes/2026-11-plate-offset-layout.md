# Check shell offsets against the requested analysis geometry

A physical plate can carry an offset on an individual triangular or quadrilateral cell. Normal analysis expands the offset. Some advanced input builders explicitly request the original nodes so they can handle the geometry separately.

The integration branch could accept an unshifted physical cell when the expander omitted its requested shift. The geometry check had inferred the requested convention from the assembled node IDs. The same model on main was refused. Main also refused an intentionally unexpanded input with an offset. The builder now identifies intentionally unexpanded inputs and accounting independently verifies the geometry against that decision.

For a previously solved model with a nonzero physical cell offset at or below the expansion threshold, review the specified offset and rerun the analysis. A measurable difference produces the existing translated geometry refusal. The solution algorithm, expansion threshold and geometry tolerance are unchanged.
