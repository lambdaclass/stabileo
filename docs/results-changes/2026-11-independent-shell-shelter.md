# Require positive clearance for independent shell cover

An independent support path lets a beam bay keep its gravity area beneath a pitched shell. Shelter requires a separate clearance check over the current plan intersection. A shell wholly at or below the deck over that intersection provides no cover. Full cover from an independent shell requires a strictly positive clearance at every intersection vertex. For planar surfaces this establishes positive clearance throughout the overlap.

In the regression, a beam bay occupies x = 2–6 m and y = 0–4 m at elevation 3 m. A separately supported quad occupies x = 0–6 m and the same y range, with elevation 2.5 m + x/4. The shell meets the bay at x = 2 m and rises above it to the other edge. The previous generator classified the entire bay as sheltered and returned a snow plan without any snow on its members. The shared exposure check now reports mixed exposure, so a plan whose pressures depend on exposure stops and asks for explicit roof and floor assignment. Uniform gravity still reaches both independently supported surfaces. Lifting the shell above the bay throughout the overlap gives complete cover. A level shell below the bay leaves the bay exposed.

Regenerate affected panel gravity and snow loads and solve again. If the generator reports mixed exposure, define the affected load regions explicitly.
