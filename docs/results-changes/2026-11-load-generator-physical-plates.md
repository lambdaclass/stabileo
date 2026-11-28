# Load generation for unmeshed physical plates

## Physical plates as load surfaces

The published load generator now reads the analytical quads and triangles used on main. An integration build also inserted an unmeshed physical outline into the analytical model for load generation. A panel that would have loaded its supporting members could instead create a whole-plate load definition. Review generated area loads and their targets if the project has physical plates and used that build.

With unified plates enabled, a straight convex physical plate can receive a whole-plate definition before meshing. An opening previously removed the entire plate from the load model. A curved side could be read as straight segments. The generator now requires the actual mesh where a single flat convex surface cannot describe the plate. This includes openings, curved surfaces and nonzero offsets. Mesh the plate, preview again and inspect its generated loads before applying. A changed physical plate also invalidates a saved preview in memory.

Roof weight, ordinary Preview, modal-wind mass planning and generation from saved settings share the same model projection. Apply validates physical targets and their source geometry before changing any case, combination, load or floor definition. Existing analytical shell calculations and solver equations are unchanged.
