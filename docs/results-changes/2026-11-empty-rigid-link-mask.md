# Explicit empty rigid-link masks

An empty or omitted degree-of-freedom list selects the historical default. In native and WASM solver inputs, the default ties the first three available slots. Those are the two in-plane translations and the rotation in a 2D frame, the two translations in a translation-only 2D model, and the three translations in 3D.

Saved projects and share links use spatial indices. Pro passes the spatial default through to the solver. Basic projects it onto the two in-plane translations for the chosen drawing plane. Gravity planning recognizes the default vertical tie. An ambiguous legacy drawing plane still requires a plane choice before analysis. Native serialization writes the default as `"dofs": []`, preserving the shape used in archived solver inputs.

In a fixed-base two-frame model with an axial tip load and a rigid link from the base to the tip, the empty list gives the same zero tip translation as the explicit default. Removing the link allows the tip to move. This restores the results of the shipped solver for historical inputs. Results computed with an intermediate build of PR #2588 can change on recalculation because that build ignored the empty link.
