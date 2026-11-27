# Point masses at physical plate nodes

Deleting a physical plate or clearing its mesh previously removed nodes that still carried point masses. Removing a node also discarded its mass assignment. A later modal, seismic or time-history calculation could therefore use a different mass distribution from the one the user had entered. Closing a hole or replacing a curved side in the integration editor could also delete a previously authored node.

Plate cleanup now checks the model's node references before removing any detached node. A shape edit can reclaim its own detached construction points. When a file supplies no evidence that the shape editor created a point, it preserves that point. Explicit deletion of a node remains an edit to its attached model data.

A project saved after a mass was discarded cannot identify that mass from the edited geometry. For projects where a plate was deleted or remeshed, compare the point masses and their locations with a copy from before the edit. Restore any missing assignments and rerun analyses that use the mass source.

## Rigid links retained during plate mesh edits

Clearing a physical plate mesh or simplifying a deferred slab could delete a user-authored rigid link solely because its slave was a mesh node. The simplified slab could also lose attached masses. A later analysis would use the remaining connections and mass assignments.

Footprint meshing now records which meshes created or share each generated rigid link. Removing a mesh releases its own connections. An authored link, or an older saved link without matching ownership evidence, keeps its nodes and degrees of freedom. A shared generated link remains until its last owner releases it. Ownership is stored separately from the analytical constraint in project files.

For a previously simplified or remeshed model, compare the rigid-link endpoints and degrees of freedom with a copy saved before the edit. Restore any missing links and rerun the analysis.

## Curved openings during plate edits

Replacing, adding or removing the control point of an outside plate edge previously discarded the arc markers of existing openings. The opening boundary then followed straight segments between its nodes. Meshing and analysis could use an opening with a different shape and area, even though the user edited only the outside edge.

The plate editor now retains curve control points by their node identity and derives their positions in the new boundary list. Entering an exterior midpoint by node ID and editing a side by its sagitta use the same rule. Adding or removing a single opening preserves every other opening.

Review plates with curved openings that were saved after an outside-edge edit. A missing arc marker cannot be recovered from its node coordinates alone. Compare the opening with the original project, restore its curves and remesh before rerunning affected analyses.
