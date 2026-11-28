# Continuous support at the base of a building wall

## Review continuous restraints at wall bases

The integration’s unified wall generator could treat two matching frame supports as permission to support the whole base of a new wall, including intermediate mesh nodes. This changed the boundary conditions before analysis. The new wall retains the existing point supports. A continuous restraint requires the explicit wall-foundation command. The ordinary tool still applies supports at the nodes of the current analytical wall mesh.

Review the model’s wall-edge supports and point restraints against the intended foundation. The saved edge alone cannot distinguish a deliberately assigned continuous support from one inferred by the former tool. Correct any unintended restraints and rerun affected analyses and foundation designs.
