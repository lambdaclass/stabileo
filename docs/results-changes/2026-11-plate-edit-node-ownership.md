# Point masses at physical plate nodes

Deleting a physical plate or clearing its mesh previously removed nodes that still carried point masses. Removing a node also discarded its mass assignment. A later modal, seismic or time-history calculation could therefore use a different mass distribution from the one the user had entered. Closing a hole or replacing a curved side in the integration editor could also delete a previously authored node.

Plate cleanup now checks the model's node references before removing any detached node. A shape edit can reclaim its own detached construction points. When a file supplies no evidence that the shape editor created a point, it preserves that point. Explicit deletion of a node remains an edit to its attached model data.

A project saved after a mass was discarded cannot identify that mass from the edited geometry. For projects where a plate was deleted or remeshed, compare the point masses and their locations with a copy from before the edit. Restore any missing assignments and rerun analyses that use the mass source.
