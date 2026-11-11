### BREAKING (results)
#### Frozen contact states and cable bar analyses are withheld (2026-11-10)

2D/3D contact now refuses frozen states that fail contact conditions after the final solve without damping (#432). Frozen states within the contact tolerance can converge. Analyses outside the dedicated cable solver now refuse cable elements because their two-way bar formulation does not enforce slackening, including tensile and unloaded cases (#417). Structured errors are translated in all six languages. The native base reproducers carried warnings; web requests now preserve cable identity so advanced analyses cannot bypass cable validation. Details: [results-change write-up](../docs/results-changes/2026-11-contact-and-cable-validity.md).
