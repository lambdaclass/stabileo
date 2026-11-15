"""Conditioning estimate of a 3D frame model's free stiffness, for reference
programs that do not expose their own matrix (Frame3DD).

`frame_kappa(model)` assembles the free stiffness with numpy, independently
of both programs, from the members of `common.model.members` (the engine's
local axes, E, G and the Timoshenko pairing asY <-> Iy, asZ <-> Iz) and
returns its Jacobi-scaled 2-norm condition number: the `kappa` the other
adapters report from their own assembly (pynite, kratos, OpenSees), which
`common/driver.py` uses to widen the tolerance to 100 eps kappa (both
programs lose about kappa eps) and to classify kappa > 1e12 as
ill_conditioned. It handles frame members with rigid restraints only (what
Frame3DD represents); anything else returns None, which keeps the fixed
tolerance.
"""

import math

from model import is_3d, members

MAX_FREE = 3000  # dense condition number: O(n^3)


def _local_stiffness(E, G, A, Iy, Iz, J, L, phi_y, phi_z):
    import numpy as np
    k = np.zeros((12, 12))
    k[0, 0] = k[6, 6] = E * A / L
    k[0, 6] = k[6, 0] = -E * A / L
    k[3, 3] = k[9, 9] = G * J / L
    k[3, 9] = k[9, 3] = -G * J / L
    # engine/src/element/frame.rs add_bending_block: Iz plane (v, rz) with
    # s = +1, Iy plane (w, ry) with s = -1.
    for v1, r1, v2, r2, I, phi, s in ((1, 5, 7, 11, Iz, phi_z, 1.0), (2, 4, 8, 10, Iy, phi_y, -1.0)):
        den = 1.0 + phi
        c1 = 12 * E * I / (L ** 3 * den)
        c2 = 6 * E * I / (L ** 2 * den)
        c3 = (4 + phi) * E * I / (L * den)
        c4 = (2 - phi) * E * I / (L * den)
        idx = (v1, r1, v2, r2)
        blk = ((c1, s * c2, -c1, s * c2), (s * c2, c3, -s * c2, c4),
               (-c1, -s * c2, c1, -s * c2), (s * c2, c4, -s * c2, c3))
        for a in range(4):
            for b in range(4):
                k[idx[a], idx[b]] = blk[a][b]
    return k


def free_stiffness(model):
    """Dense free stiffness (nodes by id, ux..rz, restrained DOFs removed),
    or None when the model has something other than frame members with
    rigid restraints."""
    import numpy as np
    if not is_3d(model):
        return None
    for e in model["elements"].values():
        if e["type"] != "frame" or any(e.get(r) for r in (
                "releaseMyStart", "releaseMyEnd", "releaseMzStart", "releaseMzEnd", "releaseTStart", "releaseTEnd",
                "hingeStart", "hingeEnd")):
            return None
    for s in model["supports"].values():
        if s.get("isInclined") or any(s.get(k) for k in ("kx", "ky", "kz", "krx", "kry", "krz", "rw", "kw")):
            return None
    if any(s.get("cw") is not None for s in model["sections"].values()):
        return None
    nids = sorted(n["id"] for n in model["nodes"].values())
    pos = {nid: i for i, nid in enumerate(nids)}
    n = 6 * len(nids)
    K = np.zeros((n, n))
    for m in members(model).values():
        sec, L, E, G = m["sec"], m["L"], m["E"], m["G"]
        phi_y = 12 * E * sec["iy"] / (G * sec["asY"] * L * L) if sec.get("asY") else 0.0
        phi_z = 12 * E * sec["iz"] / (G * sec["asZ"] * L * L) if sec.get("asZ") else 0.0
        kl = _local_stiffness(E, G, sec["a"], sec["iy"], sec["iz"], sec["j"], L, phi_y, phi_z)
        R = np.array([m["ex"], m["ey"], m["ez"]], dtype=float)
        T = np.kron(np.eye(4), R)
        kg = T.T @ kl @ T
        d = [6 * pos[m["ni"]] + i for i in range(6)] + [6 * pos[m["nj"]] + i for i in range(6)]
        K[np.ix_(d, d)] += kg
    restrained = set()
    for s in model["supports"].values():
        for i, f in enumerate(("rx", "ry", "rz", "rrx", "rry", "rrz")):
            if s.get(f):
                restrained.add(6 * pos[s["nodeId"]] + i)
    free = [i for i in range(n) if i not in restrained]
    if not free or len(free) > MAX_FREE:
        return None
    return K[np.ix_(free, free)]


def frame_kappa(model):
    """Jacobi-scaled 2-norm condition number of the free stiffness (inf for
    a DOF without stiffness), or None (see `free_stiffness`)."""
    try:
        import numpy as np
    except ImportError:
        return None
    Kf = free_stiffness(model)
    if Kf is None:
        return None
    d = np.diag(Kf)
    if not (d > 0).all():
        return math.inf
    dg = np.sqrt(d)
    return float(np.linalg.cond(Kf / np.outer(dg, dg)))
