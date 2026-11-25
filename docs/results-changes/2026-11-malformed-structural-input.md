# Refusal of malformed structural input

The authored model boundary checks support frames and restraint masks, spring curve directions, member releases and behaviour, declared shear areas, analysis settings, combination factors and constraint fields before preparing a solve. Snapshot restore validates a constraint as a whole while translating the legacy kind and DOF names. Fixture replay uses the same validation before modifying the model.

The shared 2D and 3D solver wires, their options, and the audited material, section, support, constraint, connector and spatial distributed-load records report unknown field names. These checks apply to native JSON decoding and to the WASM object and JSON inputs that use the same types. The 2D wire still accepts documented empty shell collections, and the confirmed planar aliases and optional fields keep their meaning.

Previous versions could return a result after treating an unknown combination method as linear, a string-valued release flag as rigid, or an unsupported constraint field as absent. Correct the reported field before relying on a result from an affected model. The changes leave the equations and solver tolerances in place.
