# Member diagram peaks and in-member limits

Diagram extrema are evaluated using their coordinates within the load interval. The normalized station locates the result on the diagram. This preserves the ordinate on intervals where rounding the position to a physical floating-point coordinate would move it appreciably within the interval. When a critical section shares a normalized station with a load boundary, both sections are evaluated through the same recovery path. A distinct recovered force still causes a refusal.

Concurrent station extraction checks the physical identity of cuts across force components and combinations. Distinct load cuts that share a normalized station cause a refusal. The browser also refuses a governing tuple when station transfer would change its extremum. Compact and grouped station transfers must supply the requested grid before the browser adds analytic stations.

Planar and spatial moving-load envelopes use the limits approaching each member end from inside the member. A force applied directly at a fixed support contributes through the support reaction. Loads at free ends and interior sections still contribute to the member envelope.

Spatial envelopes require each variable member piece to refer to the same parent interval in every contributing result. A mismatch causes a translated refusal before the pieces reach the envelope engine.

The RC QA diagnostic fixture stores the analytic positive moment for member 26 at normalized station approximately 0.599636. Its peak is 22.72034856 kN·m. The regular station at 0.6 still has a moment of 22.72032759 kN·m.
