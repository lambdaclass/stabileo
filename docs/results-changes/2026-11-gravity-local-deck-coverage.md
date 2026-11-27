# Evaluate automatic gravity over overlapping deck footprints

Automatic gravity checks the physical elevations of shells and beam bays over their plan overlap. It refuses an overlapping shell and bay tied vertically across a sub-storey gap when their geometry would otherwise assign two separate carriers. Independent carriers and carriers separated by a full storey remain eligible for automatic loads.

Headroom under a pitched shell is evaluated across the assigned area. The existing clearance clip removes the part within the low-headroom band when the local surface is established. The retained area receives floor actions where it is fully covered and roof actions where it is exposed. Upper beam bays use their physical elevations for the cover threshold.

If an upper shell or beam bay leaves a carrier with mixed exposure and the actions depend on it, automatic generation asks for explicit roof and floor loads. For example, an upper shell covering 7 m of a 10 m by 6 m lower shell leaves 18 m² exposed. Applying different pressures to parts of a single shell requires an explicit assignment. Uniform actions remain available.

Regenerate automatic gravity and roof loads for affected projects before using their analysis results.
