### Fixed

#### Refuse unknown or ambiguous DXF support labels

The planar DXF importer now blocks the import when a support label or block name on the APOYOS layer is unknown or ambiguous, or when two labels specify different supports at one node. The error identifies the labels and layer. Check the supports in models imported from affected drawings before using their results. See [the import evidence](../docs/results-changes/2026-11-dxf-support-labels.md).
