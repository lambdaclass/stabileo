# Explicit empty rigid-link masks

A saved rigid link with `dofs: []` contributes zero constraint equations. An omitted mask in a saved project still ties the three spatial translations. Basic projects those translations onto the two in-plane DOFs. Both kinds of record retain their original shape when saved or shared.

An axial tip force on a fixed-base cantilever produces positive tip displacement with an empty link from the base to the tip. The result equals the same cantilever with the link removed. Omitting the mask or listing the default translations ties the tip translation and changes the force path through the structure. Earlier versions treated the empty list like the default in Basic and Pro, so displacements, force recovery, and reactions can change when those projects are recalculated. A link with an empty mask also cannot transfer gravity loads or make a node structurally connected.

Native and WASM engine inputs now give explicit empty lists the same zero-equation behavior. Omitted raw engine masks retain their dimensional defaults. Raw 2D input can include the rotational slot when the model has frames. Raw 3D input defaults to the translation slots.
