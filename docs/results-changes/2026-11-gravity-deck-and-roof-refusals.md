# Refuse ambiguous automatic gravity and roof loads

Automatic panel gravity checks the original overlapping bay regions before a shell can take their load. At 1 kN/m², coextensive 60 m² beam bays at elevations 3.00 m and 3.08 m connected to a shell at 3.04 m previously produced only the shell's 60 kN of gravity. Generation now stops when the overlapping area served by the shell belongs to bay decks separated by more than the existing attached-deck limit.

The same check for positive area and deck separation applies when independent eccentric connections have unequal plan offsets. A 13 m × 9 m shell at 3.02 m that overhangs a 10 m × 6 m bay at 3.00 m formerly generated 117 kN of shell pressure and another 60 kN on the bay at the same pressure. Generation now stops when those connections leave the overlapping area without a resolved owner.

For panel and width generation, the roof coverage check refuses when a member extends past a footprint edge and rounding its projected midpoint would exclude it from the cover on that edge. The previous result could apply roof and snow loads to a member below a higher roof.

Regenerate loads on affected projects. A blocked project needs resolved geometry or explicit load assignment before analysis.
