# Preserve gravity on independently tied storeys and attached roof decks

Panel-mode automatic gravity requires two linked shells to be within the existing minimum cover rise throughout their overlap before it can assign their shared footprint to the upper shell. The existing refusal for overlapping shells without a resolvable upper carrier still applies. Two coextensive shells at 3 m and 6 m with two direct vertical ties now each receive 60 kN at 1 kN/m². The previous branch revision assigned only the upper shell's 60 kN.

The same bay member list now supplies both attachment stations and tributary geometry. A shell deck supported at two framing stub ends takes the bay's shared area. The 60 m² witness at 1 kN/m² now receives 60 kN of shell pressure. The previous branch revision and `b37840cb7d09` also loaded the framing and returned 120 kN.

Roof classification uses the bay ownership assignment to identify a shell's own framing. The attached shell at an elevation of 2.96 m in the subdivided bay now retains its uniform roof live action below the centre beam. The preview now gives the shell the same pressure as the isolated roof. Independent overhead members still shade the shell. The concentrated-roof check still blocks application in the CIRSOC witness.

Regenerate panel gravity loads in affected projects before relying on their analysis results.
