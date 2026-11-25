# Keep generated combinations consistent with eligible load cases

Auto Loads replacement preserves a superseded case's ID and its references. Generating from the saved catalog could include the emptied case as a wind alternative, creating a combination with only the permanent load effects. Every model-backed combination generator now checks the retirement marker against current direct effects. A retired case rejoins generation when it has direct effects again. Intentional empty manual alternatives remain eligible.

A project rule can have two mandatory alternative sets that each offer wind or seismic. If they fill both directions in every feasible combination, the rule cannot also cover a standalone wind case. Previously the rule generated a partial result quietly. Generation now refuses the rule and names the uncovered case before writing combinations.

Review the affected cases and alternative sets, regenerate the combinations, then rerun the analyses and envelopes. Older projects may have lost the record of which empty cases Auto Loads superseded. Review those cases before regenerating.
