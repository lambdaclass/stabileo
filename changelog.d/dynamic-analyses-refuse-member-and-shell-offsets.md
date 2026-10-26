### BREAKING (results)
#### Dynamic analyses refuse member insertion offsets and shell offsets (#460, 2026-10-25)

Modal, response-spectrum and time-history analyses, and the modal step of the seismic and wind
load plans, refuse a model with member insertion offsets or shell offsets and say why. They were
solved on the node lines, without the eccentricities the static analysis takes, so their results
for such a model did not include them. Registered with the design chain's changes (results version
4, re-check entry `dynamic-analyses-refuse-eccentricities`).
