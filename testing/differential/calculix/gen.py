"""CalculiX-specific generators: the shared ones within what ccx's U1 beam
computes correctly (adapter.py): Euler-Bernoulli sections with
j = iy + iz (U1's torsion uses the polar moment), no rotational springs,
no settlements.
Releases, trusses, translational springs and every member load kind stay."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "common"))
import gen  # noqa: E402  (common/gen.py)

_CAPS = {"truss", "release", "spring", "settlement_free", "point_load", "partial_load", "axial_load"}


def _fit(m):
    for s in m["sections"].values():
        s.pop("asY", None)
        s.pop("asZ", None)
        s["j"] = s["iy"] + s["iz"]
    for s in m["supports"].values():
        for k in ("krx", "kry", "krz", "dx", "dy", "dz", "drx", "dry", "drz"):
            s.pop(k, None)
    return m


def _no_truss_member_loads(m):
    truss = {e["id"] for e in m["elements"].values() if e["type"] == "truss"}
    m["loads"] = [ld for ld in m["loads"] if ld["type"] == "nodal" or ld["data"]["elementId"] not in truss]
    return m


def rich3d_ccx(seed):
    return _no_truss_member_loads(_fit(gen.restrict(gen.rich3d(seed), _CAPS)))


def frame3d_ccx(seed):
    return _fit(gen.frame3d(seed))


def building_ccx(seed):
    return _fit(gen.building(seed, timo=False))


def _fit2d(m):
    for s in m["sections"].values():
        s.pop("asY", None)
    for s in m["supports"].values():
        for k in ("dx", "dy", "dz", "dry", "drz"):
            s.pop(k, None)
    return m


def frame2d_ccx(seed):
    return _fit2d(gen.frame2d(seed))


def rich2d_ccx(seed):
    import gen_models
    m = _no_truss_member_loads(_fit2d(gen_models.rich_2d(seed)))
    for s in m["supports"].values():
        if s.get("type") == "spring":
            s.pop("kz", None)
            s.pop("angle", None)
    return m


GENERATORS = {"rich3d_ccx": rich3d_ccx, "frame3d_ccx": frame3d_ccx, "building_ccx": building_ccx,
              "frame2d_ccx": frame2d_ccx, "rich2d_ccx": rich2d_ccx}
