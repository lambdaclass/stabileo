### BREAKING (results)
#### Refuse ambiguous gravity carriers and roof step drift

Panel gravity blocks duplicate loading of overlapping beam bays and shell decks through fully tied seams, including ties through off-seam master nodes and seam coordinates that differ by roundoff. The Automatic Loads dialog blocks before preview when roundoff makes a gravity carrier’s slope classification indeterminate. Snow generation blocks when positive on-site roof step drift would need to be transferred to members or applicability is indeterminate, including on pitched roofs. Regenerate affected gravity or snow loads before analysis and replace saved loads if generation blocks. See [the results changes](../docs/results-changes/2026-11-gravity-carrier-refusals.md). (#2347, #2254, #2218, #2406)
