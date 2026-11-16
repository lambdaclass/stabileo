"""PyNite-specific generators: the shared ones without shear deformation
(PyNite's members are Euler-Bernoulli), so that every model is compared
instead of being skipped as unsupported."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "common"))
import gen  # noqa: E402  (common/gen.py, ahead of this file on sys.path)

_ALL_BUT_SHEAR = {"truss", "release", "spring", "settlement_free", "point_load", "partial_load", "axial_load"}


def rich3d_eb(seed):
    return gen.restrict(gen.rich3d(seed), _ALL_BUT_SHEAR)


def building_eb(seed):
    return gen.building(seed, timo=False)


GENERATORS = {"rich3d_eb": rich3d_eb, "building_eb": building_eb}
