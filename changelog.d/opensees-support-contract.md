### Fixed
#### Compare support refusals against the original input (2026-11-09)

The OpenSees comparison now checks the support contract independently before using reference stiffness to judge an engine refusal. Prescribed movement on a free direction or a direction without rotational DOFs, and a spring conflicting with a rigid restraint, make the input invalid. An engine refusal identifying the detected support defect is recorded as correct; an engine result that accepts that input is flagged and saved as a mismatch. Valid settlements still undergo the existing result comparison at unchanged tolerances. This corrects the shared cause of 52 harness findings, including #1120, #1121 and #1191, without changing engine results.
