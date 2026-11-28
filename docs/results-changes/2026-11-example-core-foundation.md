# Seven-storey example core foundation

The seven-storey concrete example placed one core corner on a fixed support and left its three other foundation corners unsupported. The raw model loader and the public gallery on main both produced this model. The integration gallery added the missing supports after loading, while a direct example load still omitted them. The example file now declares the fixed point supports at nodes 118, 119 and 120 alongside the original fixed support at node 1. Loading a fresh example through either route gives the same foundation.

Previously saved copies need review. Compare the core supports against the intended foundation and rerun the analysis and concrete design. Existing user projects keep their authored supports. The enhanced gallery and IFC wall importer can retain a deliberately fixed edge through remeshing. The published IFC command retains the current analytical point supports and their existing types.
