# Load accounting before projection and case expansion

A planar solve compares its assembled loads with the original spatial loads in the requested cases, including a case with no rows after projection. A 3D solve calculates expected force and moment from authored loads and declared case reductions and inclusion factors before comparing them with the assembled loads. If a discrepancy changes a case resultant, analysis stops and names the case, component and compared values.

The guard uses the declared member frame on the flexible span of a member with offsets. The local-Y reference follows the original member and is resolved on the offset span. Valid mirrored copies, including the oblique mirror regression, pass the check with the existing tolerance. The solver equations and load conversion are unchanged.

The comparison checks net force and moment. Different load distributions with the same resultants require a separate check.
