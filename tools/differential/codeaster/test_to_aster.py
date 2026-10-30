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

    def test_diaphragm_ties_in_plane_rotation_and_follows_omega_cross_r_in_all_planes(self):
        pts = {1: (0.0, 0.0, 0.0), 2: (2.0, 3.0, 5.0)}
        # XY: u_s = u_m + (0, 0, rz_m) x (2, 3, 5) = u_m + (-3*rz_m, 2*rz_m, 0), and rz_s = rz_m.
        xy = T._constraint_rows({"constraints": [{"type": "diaphragm", "masterNode": 1, "slaveNodes": [2], "plane": "XY"}]}, pts)
        self.assertEqual(xy, [
            [(2, 0, 1.0), (1, 0, -1.0), (1, 5, 3.0)],
            [(2, 1, 1.0), (1, 1, -1.0), (1, 5, -2.0)],
            [(2, 5, 1.0), (1, 5, -1.0)],
        ])
        # XZ: u_s = u_m + (0, ry_m, 0) x (2, 3, 5) = u_m + (+5*ry_m, 0, -2*ry_m), and ry_s = ry_m.
        xz = T._constraint_rows({"constraints": [{"type": "diaphragm", "masterNode": 1, "slaveNodes": [2], "plane": "XZ"}]}, pts)
        self.assertEqual(xz, [
            [(2, 0, 1.0), (1, 0, -1.0), (1, 4, -5.0)],
            [(2, 2, 1.0), (1, 2, -1.0), (1, 4, 2.0)],
            [(2, 4, 1.0), (1, 4, -1.0)],
        ])
        # YZ: u_s = u_m + (rx_m, 0, 0) x (2, 3, 5) = u_m + (0, -5*rx_m, 3*rx_m), and rx_s = rx_m.
        yz = T._constraint_rows({"constraints": [{"type": "diaphragm", "masterNode": 1, "slaveNodes": [2], "plane": "YZ"}]}, pts)
        self.assertEqual(yz, [
            [(2, 1, 1.0), (1, 1, -1.0), (1, 3, 5.0)],
            [(2, 2, 1.0), (1, 2, -1.0), (1, 3, -3.0)],
            [(2, 3, 1.0), (1, 3, -1.0)],
        ])


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
