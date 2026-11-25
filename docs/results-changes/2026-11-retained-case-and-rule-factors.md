# Preserve occupied load cases and edit total rule factors

Auto Loads now keeps an unbound, ordinary load case marked as generated when it still has loads or directly defined case effects. Preview and Apply derive combination eligibility from the same inventory after the selected replacement. Replace removes obsolete generated cases once they have no surviving effects or references.

In the roof-live regression model, the plan supplies a 3 kN downward force, and an older marked case holds a manual 5 kN downward force. At a factor of 2, the generated combination previously returned a 6 kN vertical reaction. It now returns 16 kN. Replace could also delete the manual load entirely when nothing else referenced its case.

A rule editor field shows the sum of ungrouped terms with its symbol and snow basis. Editing the field replaces that set of terms with one term. Clearing it removes the entire set. For a rule with `1D + 2D`, the field shows 3. Setting it to 3 gives an effective factor of 3, and clearing it removes both matching terms. Each named group and snow basis keeps its own terms.

Check saved rules against the intended factors and restore any missing manual loads from the project source or backup. Reapply Auto Loads or regenerate the affected combinations, then rerun analyses and envelopes. Saved combinations use concrete case factors until they are regenerated.
