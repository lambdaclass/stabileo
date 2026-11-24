# Ambiguous support labels in planar DXF imports

Issue [#2278](https://github.com/lambdaclass/stabileo/issues/2278).

The planar DXF importer blocks a drawing when a text label or block name on the APOYOS layer cannot identify a supported restraint. A roller label must specify its direction. Labels that specify different restraints at the same node also block import. Correct the drawing before importing again. For a support the importer cannot represent, set the intended restraint in Stabileo before solving.

In the production WASM regression model, a horizontal 10 kN load acts at the right end of a single member, with a fixed support at the left. The old importer silently made the right-end label ELASTIC_VERTICAL a pin and reported horizontal reactions of 0 kN on the left and −10 kN on the right. The current importer refuses that label. A drawing with the explicit RX label at the right end gives −10 kN on the left and 0 kN on the right, before and after this change.

Check the supports of previously imported models against their source drawings. A saved model contains the assigned support type, so there is no way to recover the original DXF label from its results.
