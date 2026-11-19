# CIRSOC 201 torsion threshold includes concurrent axial force (#2171)

Fixed section verification, provided-reinforcement checks and beam-line sizing now use the signed axial force acting with the torque. Tension lowers the threshold and compression raises it. When the axial adjustment leaves no positive threshold, every nonzero torque requires checking. Active torsion with a nonfinite axial force is refused. [CIRSOC 201-2005 §11.6.1(c)](https://app.inti.gob.ar/greenstone3/biblio/collection/works/document/ReglamentoCIRSOC201-2005_pdf), [CIRSOC 201-2025 Table 22.7.4.1(a), row (c)](https://servicios.infoleg.gob.ar/infolegInternet/anexos/420000-424999/422490/res11-4.pdf).

For a solid 300 × 600 mm section with 25 MPa concrete under 90 kN of tension, the design thresholds are 4.70621 kN·m in 2005 and 4.67723 kN·m in 2025. The branch previously neglected 5.58 kN·m against zero-axial thresholds of 5.62500 and 5.60250 kN·m respectively. That demand now activates the check, which rejects the witness cage's 240 mm stirrup spacing against a 196 mm limit. With 90 kN of compression the thresholds are 6.41349 and 6.39527 kN·m respectively.

Re-run affected spatial concrete designs and review torsion checks for members carrying axial force.
