### Fixed

#### Identify unchecked longitudinal torsion certificates by code

- Carry the existing longitudinal torsion diagnostic code on CIRSOC 201 certificates and preserve it through compatible concurrent checks. Shared verification reuse now branches on the typed code, independently of display wording. Unrelated or missing certificates cannot acquire this code. Numerical engine results and the existing unchecked-provision hold are unchanged (#2080).
