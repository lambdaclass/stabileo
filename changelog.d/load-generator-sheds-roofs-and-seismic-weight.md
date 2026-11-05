### Fixed
#### The load generator no longer loads a shed's eaves as a floor, and weighs slabs and walls in the seismic weight (2026-11-02)

In PRO, "Generate loads from the code" took the panel closed by a trussed shed's bottom chords and
eave beams for a covered floor: it put the occupancy live load and the floor finishes (screed and
tile) at the eaves, with their four pattern cases, and loaded rings of wall girts 20 m across the
same way. Panels within the roof's structure (less than 2.2 m under its trusses, rafters or
purlins everywhere the roof is over them) and panels more than 12 m both ways with no beam or slab
inside now take no area load; a floor with storey height under part of a sloped roof keeps its load;
the derivation lists them, and "Load every panel" in Applying keeps the old behaviour for a real
mezzanine or loft. A pitched roof (5° or more) with no slab, whose dead load is "the floors'" in a model with no
floors, now stops the plan with a message, instead of carrying the floors' screed and tile; a flat
roof still takes it.

The seismic weight of each level now includes the slabs, walls and roof decks drawn as shells
(thickness × density × surface, a wall half to each level it joins); it counted only the members,
so a concrete building's base shear came out about half of what it is.

When the generator writes its combinations, the four example cases and combinations a new project
starts with ("Dead Load", "Live Load", "Wind", "Earthquake", "1.4D", …) are removed if nobody
touched them, instead of staying empty beside the generated ones. The preview says so.

Re-check: generated loads of sheds and halls, and the seismic cases of buildings with shell slabs
or walls, after generating again. Saved loads do not change until they are regenerated.
