# Refusal of malformed structural input

The authored model boundary checks support frames and restraint masks, spring curve directions, member releases and behaviour, declared shear areas, analysis settings, combination factors and constraint fields before preparing a solve. Snapshot restore validates a constraint as a whole while translating the legacy kind and DOF names. Fixture replay uses the same validation before modifying the model.

The shared 2D and 3D solver wires, their options, and the audited material, section, support, constraint, connector and spatial distributed-load records report unknown field names. These checks apply to native JSON decoding and to the WASM object and JSON inputs that use the same types. The 2D wire still accepts documented empty shell collections, and the confirmed planar aliases and optional fields keep their meaning.

Previous versions could return a result after treating an unknown combination method as linear, a string-valued release flag as rigid, or an unsupported constraint field as absent. Correct the reported field before relying on a result from an affected model. The changes leave the equations and solver tolerances in place.

Plane analysis refuses equations that couple its degrees of freedom to those outside the plane. Time-history solves and certificates refuse unknown request fields, including ground acceleration fields for the other dimension. Sending a 2D ground-motion record to the previous 3D decoder could produce a result with the excitation omitted.

The authored settings and constraint checks reject unknown keys before applying defaults. For example, a misspelling of `analysis.selfWeight` can omit gravity, and `dof` in place of `dofs` can tie every translation instead of the one intended. The diagnostic names the invalid field in analysis, snapshot restore and fixture apply.

WASM object analysis requires maps for named solver records, including materials. A positional array can no longer bypass named-field validation. Authored members refuse unknown keys before release defaults, including misspelled hinge fields. Eccentric release masks with more than six entries are refused before any plane rotation. Short masks retain the implicit unreleased entries. Malformed structural fixture rows are reported by collection and index before replay.

## Planar analysis of eccentric connections with released translations

A connection whose offset has a component normal to the plane can be solved in plane when both in-plane translations are released. Those two releases remove the only equations with normal-offset terms that couple in-plane and out-of-plane motion. The remaining in-plane rotation equation ties only rotations about the plane normal. A connection with either affected translation equation active still receives the plane-coupling refusal. The spatial equations are the same.

## Planar projection of multipoint constraints

Planar analysis combines coefficients for each node and degree of freedom before projecting a multipoint constraint. For example, the two terms on the same out-of-plane displacement in `ux + uy − uy = 0` cancel, leaving the in-plane equation `ux = 0`. Earlier plane entry points could refuse or drop the entire equation. Projection retains the reduced in-plane equation and still refuses any equation that couples in-plane and out-of-plane motion after reduction. Linear, combination and nonlinear plane solves use this same projection.
