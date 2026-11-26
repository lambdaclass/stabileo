# Spatial diagram queries honor the requested cut face

Direct and prepared spatial diagram queries now apply the explicit face
argument to both normalized stations and station objects. When the argument
is omitted, a station object supplies its own face. A query without a face
selects the left side at a jump.

The regression uses a 2 m member with a shear ordinate of −4 kN immediately
before a +7 kN point action at 1 m. Equilibrium gives +3 kN immediately after
the action. A query for the right face at the physical distance of 1 m
previously returned −4 kN. It now returns +3 kN, and the left-face query
returns −4 kN.
