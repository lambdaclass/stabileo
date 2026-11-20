### BREAKING (results)
#### Refuse ambiguous gravity carriers and roof step drift

Panel gravity blocks duplicate deck loading through fully tied seams, including seam coordinates that differ by roundoff. Gravity generation blocks when coordinate roundoff can change whether a member is a carrier. Snow generation blocks positive on-site roof step drift before member transfer, including on pitched roofs. Regenerate affected gravity or snow loads before using analysis results. (#2347, #2254, #2218)
