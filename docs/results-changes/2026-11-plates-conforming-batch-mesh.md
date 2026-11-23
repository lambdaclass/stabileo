# Plate remeshing shares interface nodes across slabs and walls

## Plate remeshing shares interface nodes across slabs and walls (2026-11-20)

Unified PRO used to mesh each plate against the shells present when its turn came. A later mesh could insert a node inside an earlier shell edge, and the analysis conformity check would refuse the resulting model. The seven-storey example exhibited this both in automatic meshing before analysis and when the reinforcement sheets requested new wall meshes beside existing slabs.

The batch now fixes the stations across shared edges before replacing shells. It retains compatible neighbouring meshes and includes neighbours that need to be remeshed in the same operation. The conformity check still applies. After remeshing, shared nodes transfer forces and displacements between incident shells, so mesh connectivity, displacements, reactions, member forces and shell stresses can change. The seven-storey example can now produce results after automatic preparation. This applies to builds with unified PRO plates enabled.
