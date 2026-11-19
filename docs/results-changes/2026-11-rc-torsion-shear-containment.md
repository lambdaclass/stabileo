# Concrete shear, torsion and seismic hoop verification refusals

Previously passing CIRSOC 201 designs can now return a blocking verification result. The shear, torsion and seismic capacity formulas continue to use the existing design equations.

- In #2310, the fixed beam subjected to combined shear, torsion and axial tension reported torsion OK at a utilization of 0.9701335. Fixed and station verification now withhold approval when the combined section limit would pass using a concrete shear contribution that the evaluated cage cannot substantiate. The fixed and station checks also block combined torsion where they would overstate primary effective depth. Beam longitudinal torsion requires evidence of the bars around the closed cage. The fixed wall check no longer treats a scalar steel area as evidence of the perimeter arrangement.
- In #2300, a longitudinal torsion row credited 6.03 cm² at a cut beyond the top bar terminus and reported OK at 0.507. A longitudinal torsion row now blocks if its credited area exceeds the area that reaches the cut.
- In #2301, the published cage already retains its two primary legs on main. When the existing detailing rule requires more legs than supplied, fixed verification now gives a translated refusal while retaining the declared leg count and the strength evaluated with it.
- In #2302, the seismic hoop length check passed using the 1 m declared region even though the reopened drawing ended the dense end cage at 0.659 m. The check now uses contiguous matching hoops at both ends of the actual drawing, using the same projection that opens a legacy line.
- In #2309, the 2005 section checker could pass active torsion using uncapped 500 MPa steel. It now refuses active torsion when the specified yield exceeds the 420 MPa cap in §11.6.3.4. The station path already applies the cap.
- In #2296, an active cut in a drawn stirrup gap reported 343.10 kN of shear capacity. That cut is now reported as missing stirrups. A hogging cut that uses the larger span depth also blocks when the reinforcement indicates a shallower tension face.

Re-run affected concrete member verification and review any blocked checks before relying on the design or detailing.
