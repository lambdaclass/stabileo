### Fixed
#### Reopened projects use their saved geometry with sheets disabled

A production analysis uses the member and plate offsets stored in the model. Projects with saved placement rules show a notice on open. Reopening them with reinforcement sheets enabled restores placement editing and recalculation.

The published shell form again offers the curved formulation for a four-node shell and shows the out-of-plane distance while the flat formulation is selected. The unified plate form continues to infer curvature from the corners.

The published shell panel again counts triangular and quadrilateral shells with an unattached corner, including raw shells reopened from a saved project.

The saved placement notice reads the same metadata as the project importer in the published application and the production comparison.

With sheets disabled the specifications panel also omits the placement editor from the compiled application.
