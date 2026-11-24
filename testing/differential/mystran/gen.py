"""MYSTRAN-specific generators.

modal3d_lumped: the shared modal3d models with the bending moment about
local y released at one end of every member. MYSTRAN's BAR mass is lumped
(rho A L / 2 per end, no rotary inertia); stabileo's frame mass is lumped the
same way only for members with a released rotation
(engine/src/solver/mass_matrix.rs), so these models have the same mass
matrix in both programs. A release is placed at an end whose node keeps its
stiffness about that axis from another member (one not parallel to the
axis) or from a full rotational restraint; members without such an end are
left as they are and the model is then unsupported. Models that still
become mechanisms are skipped by the driver's static probe.
"""

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "common"))
import gen  # noqa: E402  (common/gen.py)
from model import members  # noqa: E402


def modal3d_lumped(seed):
    m = gen.modal3d(seed)
    for e in m["elements"].values():
        e["type"] = "frame"
    mem = members(m)
    held = {s["nodeId"] for s in m["supports"].values() if s.get("rrx") and s.get("rry") and s.get("rrz")}

    def braced(eid, node, axis):
        if node in held:
            return True
        return any(abs(sum(p * q for p, q in zip(axis, o["ex"]))) < 0.99
                   for oid, o in mem.items() if oid != eid and node in (o["ni"], o["nj"]))

    for eid, mm in mem.items():
        e = mm["e"]
        if braced(eid, mm["nj"], mm["ey"]):
            e["releaseMyEnd"] = True
        elif braced(eid, mm["ni"], mm["ey"]):
            e["releaseMyStart"] = True
    return m


GENERATORS = {"modal3d_lumped": modal3d_lumped}
ANALYSIS = {"modal3d_lumped": "modal"}
