### Performance
#### The 3-D reinforcement view opens with less garbage to collect (2026-11-07)

Opening the 3-D reinforcement view on the 7-storey example made the garbage collector pause for
about a second, at a different point on each open (#1667). The issued document was wrapped in a
reactive proxy, so building the 3-D scene from it created a tracked value for every field it read.
The tube geometry was built through growing JavaScript arrays and about half a million temporary
vectors. The document is now stored as built, and the tubes are written into buffers sized up
front with their frame vectors reused. The geometry is bit-identical to before.
