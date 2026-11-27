# Automatic gravity on triangular slabs

Previously, automatic gravity omitted triangular plates from coverage and pressure allocation. It could assign their pressure to the surrounding beams while preserving the total force.

## Transfer automatic gravity through triangular slabs

Panel-mode generation now puts the pressure on the triangular slab cells. The slab and surrounding beams use the same footprint partition, so the beams collect the area outside the slab through the existing bay transfer. Both shell families contribute to roof coverage, roof weight and level weight. In explicit-width mode the chosen beam widths still determine the beam loads, and the triangular shell geometry participates in identifying the covered members.

The pressure retains its plate or quad target when the plan is applied and when the project is saved. Triangular cells with the same numeric ID as a quad can therefore receive different actions without sharing an owner. Regenerate automatic loads and re-run the analysis for affected projects.
