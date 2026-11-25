# Saved combination rules respect load groups

A saved combination term could apply its factor to every load case of the same symbol. A term intended for roof live load could therefore include floor live load, and a rule with separate floor and roof factors could apply both factors to both cases. Rule templates also lost the group when imported.

The Loads tab and load-plan preview and Apply now use the same selection by load symbol and group. An ungrouped term takes the remaining cases of its symbol. A rule with no named groups still takes all cases of its symbol. An active term whose group cannot be resolved blocks generation before any loads or combinations are written.

The regression model has downward floor and roof loads of 3 and 5 kN. A roof-only rule with a factor of 2 previously yielded a 16 kN vertical reaction instead of 10 kN. This changed the 2D and 3D linear results and their envelopes, along with 3D second-order and direct analysis results. The inputs and expected reaction come from the test model.

When two terms select cases in the same alternative set, each generated combination takes one case with its own factor, even when the terms use different load symbols. Wind and seismic directions still follow their own exclusivity and reversal rules. In the review model, treating the floor and roof cases as alternatives produces two reactions, 3 kN and 10 kN. Picking both cases produced one reaction of 13 kN. Independently acting cases still contribute together.

Within a shared alternative set, a whole case can stand in for a companion pattern only when both have the same load symbol. A whole wind case and a partial live-load case in the same set each produce a separate combination when the set has no whole live-load case. The regression model applies synthetic downward loads of 13 kN for the live pattern and 5 kN for wind, with factors of 1 and 2 respectively. Both combinations now contribute to the envelope, which gives 13 kN. The earlier implementation of cross-symbol exclusivity dropped the live pattern and gave 10 kN.

The named group and the ungrouped remainder share the same pool of planned and eligible retained cases for that symbol. Auto Loads preserves the group of an ordinary case selected by ID when the plan omits the group. It skips composite cases when choosing where to write. If the project has generated loads in a typed composite case, review that case before regenerating the load plan and combinations.

Imported rule templates now reject malformed terms as a whole document. A malformed live term previously could disappear while the dead term remained. Import also preserves a flat-roof snow term's basis so the expansion selects the flat-roof case. If a project already imported an affected template, compare the saved rules with the original template before regenerating results.

Review and regenerate combinations previously created from grouped rules or shared alternative sets, including combinations written as composite cases, then rerun the analyses and envelopes. Concrete case-ID factors already saved to a project do not change when the project is opened.
