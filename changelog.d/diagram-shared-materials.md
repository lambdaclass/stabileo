### Performance
#### Draw a 3D diagram with one set of materials (2026-11-18)

Every member of a 3D force diagram made its own fill, outline, closing and
marker materials and its own marker sphere, the sphere even where nothing was
marked. A diagram now makes one of each for the group (two for an envelope,
one a colour) and makes the sphere when the first marker needs it. The objects
drawn, their vertices, colours and order are the same. A moment diagram of
3,414 members builds in 52 ms where it took 72.

`make bench.web.render` builds the diagrams and the deformed shape of the
examples given and prints a digest of everything each build draws, so two
versions can be compared.
