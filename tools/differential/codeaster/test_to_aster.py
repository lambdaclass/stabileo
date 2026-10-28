#!/usr/bin/env python3
"""Unit tests of the Code_Aster translation helpers (no Code_Aster needed).

    python3 tools/differential/codeaster/test_to_aster.py

Run by the codeaster-diff job (.github/workflows/nightly.yml) before the
comparison.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import to_aster as T  # noqa: E402

FIXED, FREE = [True] * 6, [False] * 6


class ConstraintRedundancy(unittest.TestCase):
    """constraints_redundant: only genuinely dependent equations make a model
    unsupported; independent ones are translated whatever their term order."""

    def test_mpc_with_restrained_first_term_is_independent(self):
        # -2*rx_1 + uy_2 = 0 with node 1 fixed: the engine's dependent term is
        # the free uy_2; support and MPC are independent equations.
        self.assertFalse(T.constraints_redundant([[(1, 3, -2.0), (2, 1, 1.0)]], {1: FIXED, 2: FREE}, {}))
        self.assertFalse(T.constraints_redundant([[(2, 1, 1.0), (1, 3, -2.0)]], {1: FIXED, 2: FREE}, {}))

    def test_supported_slave_of_free_master_is_independent(self):
        # u_2 - u_1 = 0 with only node 2 supported: it fixes u_1, nothing is implied twice.
        self.assertFalse(T.constraints_redundant([[(2, 0, 1.0), (1, 0, -1.0)]], {1: FREE, 2: FIXED}, {}))

    def test_link_between_two_supported_dofs_is_redundant(self):
        # aster3d-744151: the dependent node of a rigid link to a fixed node
        # also has a support on the same DOF.
        self.assertTrue(T.constraints_redundant([[(2, 0, 1.0), (1, 0, -1.0)]], {1: FIXED, 2: FIXED}, {}))

    def test_inclined_support_along_the_link_is_redundant(self):
        self.assertTrue(T.constraints_redundant([[(2, 0, 1.0), (1, 0, -1.0)]], {1: FIXED, 2: FREE}, {2: [1.0, 0.0, 0.0]}))

    def test_inclined_support_across_the_link_is_independent(self):
        self.assertFalse(T.constraints_redundant([[(2, 0, 1.0), (1, 0, -1.0)]], {1: FIXED, 2: FREE}, {2: [0.0, 1.0, 0.0]}))

    def test_duplicate_equations_are_redundant(self):
        self.assertTrue(T.constraints_redundant([[(2, 1, 1.0), (3, 1, -1.0)], [(3, 1, 2.0), (2, 1, -2.0)]], {}, {}))

    def test_no_constraints(self):
        self.assertFalse(T.constraints_redundant([], {1: FIXED}, {}))


class DiaphragmRows(unittest.TestCase):
    """_constraint_rows for a diaphragm: a rigid in-plane rotation of the
    whole floor (u = theta x r, every node turning by theta) satisfies every
    row, and the slave's in-plane rotation is tied (the engine's diaphragm,
    constraints.rs; aster3d-754008/754070/754079/754186/754253/754265/754299
    mismatched on the untied slave rotation)."""

    PTS = {1: (0.0, 0.0, 0.0), 2: (1.5, -2.0, 0.7), 3: (-0.4, 1.1, 2.3)}

    def rows(self, plane):
        d = {"constraints": [{"type": "diaphragm", "masterNode": 1, "slaveNodes": [2, 3], "plane": plane}]}
        return T._constraint_rows(d, self.PTS)

    def test_rigid_rotation_satisfies_rows(self):
        for plane, axis in (("XY", 2), ("YZ", 0), ("XZ", 1)):
            th = [0.0, 0.0, 0.0]
            th[axis] = 0.01
            u = {}
            for n, p in self.PTS.items():
                t = [th[1] * p[2] - th[2] * p[1], th[2] * p[0] - th[0] * p[2], th[0] * p[1] - th[1] * p[0]]
                u[n] = t + th
            for row in self.rows(plane):
                self.assertAlmostEqual(sum(c * u[n][k] for n, k, c in row), 0.0, places=15, msg=(plane, row))

    def test_slave_in_plane_rotation_is_tied(self):
        for plane, dr in (("XY", 5), ("YZ", 3), ("XZ", 4)):
            rows = self.rows(plane)
            for sl in (2, 3):
                self.assertIn([(sl, dr, 1.0), (1, dr, -1.0)], rows)


class ConnectorMatrix(unittest.TestCase):
    """connector_matrix (port of element/connector.rs): symmetric, and every
    rigid-body motion is force free, including rotations of a finite-length
    connector whose shear acts through rigid arms."""

    def setUp(self):
        self.k = T.connector_matrix([1.0, 2.0, 3.0, 4.0, 5.0, 6.0], [1, 0, 0], [0, 1, 0], [0, 0, 1], 2.0)

    def test_symmetric(self):
        for i in range(12):
            for j in range(12):
                self.assertAlmostEqual(self.k[i][j], self.k[j][i], places=14)

    def test_rigid_body_motions_are_force_free(self):
        motions = [
            [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
            [0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 0, 1],    # rotation about z through node i (node j at x = 2)
            [0, 0, 0, 0, 1, 0, 0, 0, -2, 0, 1, 0],   # rotation about y
            [0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0],    # rotation about the axis
        ]
        for u in motions:
            f = [sum(self.k[i][j] * u[j] for j in range(12)) for i in range(12)]
            self.assertTrue(all(abs(x) < 1e-12 for x in f), (u, f))

    def test_shear_couples_to_end_rotation(self):
        # the old diagonal K_TR_D_L had no shear-rotation coupling
        self.assertNotEqual(self.k[1][5], 0.0)


if __name__ == "__main__":
    unittest.main()
