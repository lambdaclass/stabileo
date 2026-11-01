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


def _beam(support2):
    return {
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.0, "y": 0.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-4, "iz": 1e-4, "j": 2e-4}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
        "supports": {"1": {"nodeId": 1, **{f: True for f in T.FLAGS}}, "2": {"nodeId": 2, **support2}},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fy": 0.0, "fz": -1.0, "mx": 0.0, "my": 0.0, "mz": 0.0}}],
    }


def _engine_refusal(key, node, name, value, why):
    return (f"stabileo: Support {key} (node {node}): the prescribed {name} = {value} would not be applied, "
            f"because {why}. Restrain that direction to impose it, or remove the prescribed value.")


class UnimposedSettlements(unittest.TestCase):
    """A settlement no rigid restraint carries: the translator drops it, the
    engine refuses it (AC-10). The harness must not call that refusal false."""

    def test_unflagged_and_spring_freed_dofs(self):
        free = {**{f: True for f in T.FLAGS}, "ry": False, "dy": -0.001}
        spring = {**{f: True for f in T.FLAGS}, "kz": 1e4, "dz": 0.002}
        self.assertEqual(T.unimposed_settlements(_beam(free)), [("2", "dy")])
        self.assertEqual(T.unimposed_settlements(_beam(spring)), [("2", "dz")])

    def test_restrained_settlement_is_imposed(self):
        held = {**{f: True for f in T.FLAGS}, "dy": -0.001, "drz": 0.0}
        self.assertEqual(T.unimposed_settlements(_beam(held)), [])
        self.assertIn("DY=-0.001", T.translate(_beam(held))[0].replace(" ", ""))

    def test_inclined_support_carries_translations_but_not_free_rotations(self):
        inc = {**{f: False for f in T.FLAGS}, "isInclined": True, "normalX": 0.0, "normalY": 0.0, "normalZ": 1.0,
               "dz": 0.001, "drx": 0.001}
        self.assertEqual(T.unimposed_settlements(_beam(inc)), [("2", "drx")])

    def test_engine_message_format_is_the_one_parsed(self):
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..",
                               "engine", "src", "solver", "linear.rs")) as f:
            src = f.read()
        self.assertIn('"{what}: the prescribed {name} = {v} would not be applied, because {why}.', src)
        self.assertIn('format!("Support {key} (node {})", sup.node_id)', src)


class Classification(unittest.TestCase):
    """run.prepare: the refusal of a settlement the translator would drop is
    `refused`; any other refusal still goes to Code_Aster; a solved model with
    such a settlement is flagged; refusal messages are kept whole."""

    def prepare(self, model, outcome):
        import tempfile
        from unittest import mock
        import run as R

        def stabileo(_model, _binary):
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

        with tempfile.TemporaryDirectory() as wd, mock.patch.object(R.C, "stabileo", stabileo), \
                mock.patch.object(R.C, "normalize_stabileo", lambda raw, dim: {"diags": []}):
            return R.prepare("m", model, "solve_json", wd)

    def test_refusal_of_the_dropped_settlement_is_agreed(self):
        model = _beam({**{f: True for f in T.FLAGS}, "ry": False, "dy": -0.00010986903031340312})
        msg = _engine_refusal("2", 2, "dy", -0.00010986903031340312, "that direction is not restrained (its flag is not set)")
        r = self.prepare(model, RuntimeError("stabileo: " + msg[len("stabileo: "):]))
        self.assertEqual(r["status"], "refused")
        self.assertEqual(r["why"][0], msg)
        self.assertGreater(len(r["why"][0]), 200)

    def test_refusal_naming_another_dof_still_goes_to_code_aster(self):
        model = _beam({**{f: True for f in T.FLAGS}, "ry": False, "dy": -0.001})
        msg = _engine_refusal("2", 2, "dz", -0.001, "that direction is not restrained (its flag is not set)")
        r = self.prepare(model, RuntimeError(msg))
        self.assertEqual(r["status"], "pending")
        self.assertEqual(r["refused"], [msg])

    def test_other_refusals_are_kept_whole(self):
        msg = "stabileo: " + "x" * 150 + " 0.000123456789012345 " + "y" * 150
        r = self.prepare(_beam({f: True for f in T.FLAGS}), RuntimeError(msg))
        self.assertEqual(r["status"], "pending")
        self.assertEqual(r["refused"], [msg])

    def test_solving_with_a_dropped_settlement_is_flagged(self):
        model = _beam({**{f: True for f in T.FLAGS}, "kz": 1e4, "dz": 0.002})
        r = self.prepare(model, {})
        self.assertEqual(r["status"], "silent_unimposed")


if __name__ == "__main__":
    unittest.main()
