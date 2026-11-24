### BREAKING (results)
#### Supplied linear results require a stable load case (2026-11-23)

Native 2D and 3D linear certificate APIs now refuse to certify supplied responses to loads the current solver rejects. A numerical spring could previously support a moment at an all-hinged joint and the certificate could report a small error bound. The affected cases and their dependent combinations now have no certificate bound. [Results change](../docs/results-changes/2026-11-supplied-linear-certificates.md).
