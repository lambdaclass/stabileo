### BREAKING (results)

#### A load combination judges its members' relative displacement on its own displacements (2026-11-06)

A load combination warned `LIN-SMALL-DISPLACEMENT` for a member only when one of its cases did. A member whose relative end displacement over its length, ‖Δu‖/L, was 0.06 in a case and 0.12 in a combination with factor 2 was not warned, and a member warned in a case stayed warned where the combination reduced or cancelled it (#1506). Each linear static result, 2D or 3D, now records every two-node member's Δu/L vector as `resultSummary.memberChords`, and a combination sums them with its factors and warns where the norm of its own sum exceeds 0.1, recording the sum in its own summary. A case without that record still has its member warnings carried, and the combination then records none. Numerical values are unchanged.
