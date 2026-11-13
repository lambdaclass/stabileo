### Fixed

#### Reaction recovery notices preserve unexplained static result changes

Restrict the reaction recovery notice to structural models with an affected analysis context. Empty models and unchanged recorded linear results no longer receive the notice. Declare only the added equilibrium fields to the result gates, preserving failures for wrong historical forces, displacements and unrelated linear refusals (#1949).
