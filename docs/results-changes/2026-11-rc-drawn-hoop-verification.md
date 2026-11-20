# RC frame verification from drawn hoop zones

A beam-line projection could give the seismic frame check only the stirrup definitions sampled from the beam regions. Rebuilding the drawn zones from those definitions could hide a fully covered interval with fewer legs, wider spacing or a different diameter. The projection now carries each drawn interval's stirrup definition and original length. The frame check counts only contiguous intervals from each support face that meet the hoop definition used in its calculation.

The regression exercises each difference at either end of the same beam. Previously the projected cage passed. It now reports the translated hoop-zone finding. Matching hoops and hoops of the same diameter with more legs or closer spacing still pass.

A concrete member without a verified strength result can still have passing local checks, such as deflection. The memoria, workbook and IFC now keep its member state open and carry the translated refusal when the code check supplies one.

Re-run the seismic frame checks and regenerate design exports for affected projects.
