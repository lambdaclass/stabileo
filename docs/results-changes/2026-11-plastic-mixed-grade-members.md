# Plastic collapse of members sharing a section across steel grades

Basic 2D collapse and Pro 3D pushover previously used the yield stress of the first member assigned a section. Changing which member came first could raise or lower the collapse factor, change the hinge sequence, and alter the inputs used to certify the result. Rerun plastic analyses of frames that reuse a section with different materials.

Each member now contributes its own material to the capacity calculation. Section rotation follows the bending axes for the analysis dimension. A stiffness modifier affects the elastic section used in the solve while the plastic modulus comes from the model section. On the solver wire, each elastic section and material combination carries its own strength override.

The regression for #2658 loads only one of two cantilevers sharing a section at a common fixed support. It checks the first hinge and collapse against the loaded member’s yield stress times the section plastic modulus divided by the tip force and span. Changing the other cantilever’s grade leaves that result unchanged. The tests also check weak-axis loading, modified stiffness and the Basic certificate payload.

Direct native and WASM inputs can also contain one unsplit section shared by different materials. The incremental solvers, exact certificates and certificate bundles now select the material from each member for automatic capacities. An explicit section capacity override retains its prescribed value for every member to which the input assigns it.
