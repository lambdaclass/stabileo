# Refusal of malformed structural input

The authored model boundary checks support frames and restraint masks, spring curve directions, member releases and behaviour, declared shear areas, analysis settings, combination factors and constraint fields before preparing a solve. Snapshot restore validates a constraint as a whole while translating the legacy kind and DOF names. Fixture replay uses the same validation before modifying the model.

The shared 2D and 3D solver wires, their options, and the audited material, section, support, constraint, connector and spatial distributed-load records report unknown field names. These checks apply to native JSON decoding and to the WASM object and JSON inputs that use the same types. The 2D wire still accepts documented empty shell collections, and the confirmed planar aliases and optional fields keep their meaning.

Previous versions could return a result after treating an unknown combination method as linear, a string-valued release flag as rigid, or an unsupported constraint field as absent. Correct the reported field before relying on a result from an affected model. The changes leave the equations and solver tolerances in place.

Plane analysis refuses equations that couple its degrees of freedom to those outside the plane. Time-history solves and certificates refuse unknown request fields, including ground acceleration fields for the other dimension. Sending a 2D ground-motion record to the previous 3D decoder could produce a result with the excitation omitted.

The authored settings and constraint checks reject unknown keys before applying defaults. For example, a misspelling of `analysis.selfWeight` can omit gravity, and `dof` in place of `dofs` can tie every translation instead of the one intended. The diagnostic names the invalid field in analysis, snapshot restore and fixture apply.

WASM object analysis requires maps for named solver records, including materials. A positional array can no longer bypass named-field validation. Authored members refuse unknown keys before release defaults, including misspelled hinge fields. Eccentric release masks with more than six entries are refused before any plane rotation. Short masks retain the implicit unreleased entries. Malformed structural fixture rows are reported by collection and index before replay.

JSON analysis refuses a repeated key in the `connectors` table while decoding both planar and spatial models. With two parallel axial connectors under one repeated key, earlier analysis used only the last connector. The omitted stiffness increased tip displacement and the axial force recovered in the parallel frame member. Two distinct keys still apply both connectors.

Combination analysis refuses a repeated ID before resolving factors or running solves. For two combinations that scale the same load by 1 and 2, the distinct-ID model returns separate reactions that balance each scaled force. A repeated ID previously let the second result replace the first in the result map. The refusal identifies the repeated row's `combinations[i].id`.

## Planar analysis of eccentric connections with released translations

A connection whose offset has a component normal to the plane can be solved in plane when both in-plane translations are released. Those two releases remove the only equations with normal-offset terms that couple in-plane and out-of-plane motion. The remaining in-plane rotation equation ties only rotations about the plane normal. A connection with either affected translation equation active still receives the plane-coupling refusal. The spatial equations are the same.

## Planar projection of multipoint constraints

Planar analysis combines coefficients for each node and degree of freedom before projecting a multipoint constraint. For example, the two terms on the same out-of-plane displacement in `ux + uy − uy = 0` cancel, leaving the in-plane equation `ux = 0`. Earlier plane entry points could refuse or drop the entire equation. Projection retains the reduced in-plane equation and still refuses any equation that couples in-plane and out-of-plane motion after reduction. Linear, combination and nonlinear plane solves use this same projection.

Named planar models require a JSON object. WASM object interfaces preserve the supplied keys of solver tables written as key/value pairs, and reject malformed pairs, duplicate keys, and unsupported fields in their records. Combinations reject unknown keys before resolving factors. An intended spatial SRSS combination with opposing case responses could otherwise report a linear sum of zero after silently ignoring a misspelled `method`.

An overflowing reduced multipoint constraint can be sent to the planar solver when a common power-of-two scale preserves every active coefficient. For example, two maximum finite coefficients on the same displacement give the homogeneous constraint `ux = 0`. The solver now returns that constrained displacement. It still refuses when scaling would lose an active term. The eccentric-connection and multipoint-constraint notices use the projection of the recorded solve plane.

An authored support with `dofRestaints` is refused before its support type can supply default restraints. A fixed support whose intended mask leaves axial translation free otherwise restrains that translation and changes the displacement and reactions. Saved-result recheck validates each supplied structural collection and allows omitted collections in partial records.

WASM object analysis requires fixed-size sequences to be consumed in full. For example, a quadrilateral sent with a fifth node ID used to solve using the first four IDs. The analysis now reports a parse error for the invalid length.

A single surviving nonzero planar MPC coefficient can be represented by one even when the exact sum is too large and no exact common scale fits. For finite binary64 maximum `M` and minimum positive value `m`, the grouped equation `(M + M + m) ux = 0` is equivalent to `ux = 0`, since the coefficient is strictly positive. The dimensional coupling and multicomponent representation checks still apply.

The result notice uses the recorded solve plane when available and otherwise uses the saved project plane. For projects with neither, it checks all supported planar projections.

Member stiffness modifier objects reject unknown keys in authored solves, snapshot restore and fixture validation. A key such as `iZ` previously allowed a solve with nominal bending stiffness. The diagnostic identifies the misspelled key.
