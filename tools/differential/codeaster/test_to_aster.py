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


class Diaphragm(unittest.TestCase):
    """Diaphragm rows (constraints.rs): an in-plane rigid motion of the whole
    diaphragm satisfies them, a slave rotating on its own does not."""

    PTS = {1: [1.0, 2.0, 3.0], 2: [4.0, -1.0, 5.5]}

    def rows(self, plane):
        return T._constraint_rows({"constraints": [{"type": "diaphragm", "masterNode": 1, "slaveNodes": [2], "plane": plane}]}, self.PTS)

    def motion(self, plane, slave_twist=0.0):
        axis = {"XY": 2, "YZ": 0, "XZ": 1}[plane]
        w = [0.0, 0.0, 0.0]
        w[axis] = 0.01
        t = [0.3, -0.2, 0.1]
        r = [self.PTS[2][k] - self.PTS[1][k] for k in range(3)]
        us = [t[k] + T._cross(w, r)[k] for k in range(3)]
        ws = list(w)
        ws[axis] += slave_twist
        return {1: t + w, 2: us + ws}

    def residuals(self, plane, u):
        return [sum(c * u[n][k] for n, k, c in row) for row in self.rows(plane)]

    def test_in_plane_rigid_motion_satisfies_every_row(self):
        for plane in ("XY", "YZ", "XZ"):
            self.assertEqual(len(self.rows(plane)), 3, plane)
            for res in self.residuals(plane, self.motion(plane)):
                self.assertAlmostEqual(res, 0.0, places=14, msg=plane)

    def test_slave_in_plane_rotation_is_tied(self):
        for plane in ("XY", "YZ", "XZ"):
            self.assertTrue(any(abs(res) > 1e-6 for res in self.residuals(plane, self.motion(plane, 0.003))), plane)


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


def _mechanism_beam():
    model = _beam({f: True for f in T.FLAGS})
    model["nodes"]["5"] = {"id": 5, "x": 3.0, "y": 2.0, "z": 0.0}
    model["elements"]["2"] = {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 5, "materialId": 1, "sectionId": 1}
    return model


def _raw(rz5=0.0, uz2=-1e-3, reac5=None, m12=3.0):
    disp = [{"nodeId": 1, **{k: 0.0 for k in ("ux", "uy", "uz", "rx", "ry", "rz")}},
            {"nodeId": 2, "ux": 0.0, "uy": 0.0, "uz": uz2, "rx": 0.0, "ry": 0.0, "rz": 0.0},
            {"nodeId": 5, "ux": 0.0, "uy": 0.0, "uz": uz2, "rx": 0.0, "ry": 0.0, "rz": rz5}]
    reac = [{"nodeId": 1, "fx": 0.0, "fy": 0.0, "fz": 1.0, "mx": 0.0, "my": m12, "mz": 0.0}]
    if reac5 is not None:
        reac.append({"nodeId": 5, "fx": 0.0, "fy": 0.0, "fz": 0.0, "mx": 0.0, "my": 0.0, "mz": reac5})
    keys = [f"{n}{e}" for n in ("n", "vy", "vz", "mx", "my", "mz") for e in ("Start", "End")]
    forces = [{"elementId": 1, **{k: 0.0 for k in keys}, "myStart": m12}, {"elementId": 2, **{k: 0.0 for k in keys}}]
    return {"displacements": disp, "reactions": reac, "elementForces": forces, "structuredDiagnostics": []}


class HeldMechanism(unittest.TestCase):
    """A singular disagreement is excused only when stabileo itself shows it is a mechanism: moving
    the disagreeing DOF changes nothing else and needs no force."""

    def held(self, original, moved, bad, binary="bin", apply=True):
        from unittest import mock
        import run as R
        sres = R.C.normalize_stabileo(original, 3)
        seen = []
        def solve(model, b):
            seen.append(model)
            if apply:
                imposed = next(s for s in model["supports"].values() if s.get("nodeId") == 5)["drz"]
                for d in moved["displacements"]:
                    if d["nodeId"] == 5:
                        d["rz"] = imposed
            return moved
        with mock.patch.object(R.C, "stabileo", solve):
            ok = R.held_mechanism(_mechanism_beam(), sres, bad, binary, 1e-6)
        for model in seen:
            moved_support = [s for s in model["supports"].values() if s.get("nodeId") == 5]
            self.assertTrue(moved_support and moved_support[0]["rrz"] and moved_support[0]["drz"] != 0.0)
        return ok

    def test_a_free_unloaded_rotation_that_moves_nothing_is_a_mechanism(self):
        self.assertTrue(self.held(_raw(rz5=1e13), _raw(rz5=2e13, reac5=0.0), [("disp", 5, "rz", 1e13, 0.0, 1.0)]))

    def test_a_stiff_dof_is_not_even_at_zero_displacement(self):
        bad = [("disp", 5, "rz", 0.0, 1e-3, 1.0)]
        self.assertFalse(self.held(_raw(rz5=0.0), _raw(rz5=1e-3, reac5=0.5), bad), "moving it needs a moment")
        self.assertFalse(self.held(_raw(rz5=0.0), _raw(rz5=1e-3, uz2=-2e-3, reac5=0.0), bad), "moving it moved node 2")
        self.assertFalse(self.held(_raw(rz5=0.0), _raw(rz5=1e-3, reac5=0.0, m12=4.0), bad), "a member force changed")

    def test_the_rerun_must_apply_the_motion_and_report_its_reaction(self):
        bad = [("disp", 5, "rz", 1e13, 0.0, 1.0)]
        self.assertFalse(self.held(_raw(rz5=1e13), _raw(rz5=1e13, reac5=0.0), bad, apply=False), "the prescription was ignored")
        self.assertFalse(self.held(_raw(rz5=1e13), _raw(rz5=1e13), bad), "no reaction reported at the moved DOF")

    def test_only_displacements_of_known_free_nodes_with_a_binary_qualify(self):
        moved = _raw(reac5=0.0)
        self.assertFalse(self.held(_raw(), moved, [("reac", 1, "fz", 1.0, 2.0, 1.0)]))
        self.assertFalse(self.held(_raw(), moved, [("force", 1, "mz", 1.0, 2.0, 1.0)]))
        self.assertFalse(self.held(_raw(), moved, [("disp", 9, "rz", 0.0, 1.0, 1.0)]))
        self.assertFalse(self.held(_raw(), moved, [("disp", 1, "rz", 0.0, 1.0, 1.0)]), "node 1 is fixed")
        self.assertFalse(self.held(_raw(), moved, [("disp", 5, "rz", 0.0, 1.0, 1.0)], binary=None))


class CoupledMechanism(unittest.TestCase):
    """Two DOFs of node 5 (rx, rz) share a rigid motion: the stiffness [[1, -1], [-1, 1]] needs no
    force to move both together, but one to move them apart. A disagreement is a mechanism only along
    that shared motion; each DOF moved alone, with the other free to follow, would excuse both."""

    def held(self, d_rx, d_rz):
        from unittest import mock
        import run as R
        original = _raw()
        sres = R.C.normalize_stabileo(original, 3)
        seen = []

        def solve(model, b):
            seen.append(model)
            sup = next(s for s in model["supports"].values() if s.get("nodeId") == 5)
            rx, rz = sup.get("drx"), sup.get("drz")
            rx, rz = (rz if rx is None else rx), (rx if rz is None else rz)
            moved = _raw(rz5=rz, reac5=(rz - rx) if sup.get("rrz") else 0.0)
            for d in moved["displacements"]:
                if d["nodeId"] == 5:
                    d["rx"] = rx
            next(r for r in moved["reactions"] if r["nodeId"] == 5)["mx"] = (rx - rz) if sup.get("rrx") else 0.0
            return moved

        bad = [("disp", 5, "rx", 0.0, d_rx, 1.0), ("disp", 5, "rz", 0.0, d_rz, 1.0)]
        with mock.patch.object(R.C, "stabileo", solve):
            ok = R.held_mechanism(_mechanism_beam(), sres, bad, "bin", 1e-6)
        return ok, seen

    def test_a_shared_rigid_motion_is_a_mechanism(self):
        ok, seen = self.held(1.0, 1.0)
        self.assertTrue(ok)
        self.assertEqual(len(seen), 1, "one rerun moves every disagreeing DOF at once")
        sup = next(s for s in seen[0]["supports"].values() if s.get("nodeId") == 5)
        self.assertTrue(sup["rrx"] and sup["rrz"] and sup["drx"] == sup["drz"] != 0.0)

    def test_a_relative_deformation_between_coupled_dofs_is_not(self):
        self.assertFalse(self.held(1.0, -1.0)[0])
        self.assertFalse(self.held(1.0, 0.5)[0])


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


class SingularVerdict(unittest.TestCase):
    """Code_Aster singular at NPREC=10 and disagreeing with the check off:
    `silent_singular` only when stabileo gave no conditioning warning; every
    such result carries `why`, and the summary never needs one."""

    def finish(self, diags, issues=(), bad=(("disp", 5, "rz", 0.0, 1.04e13, 1.0),), held=lambda bad: all(b[0] == "disp" for b in bad)):
        import json as J
        import tempfile
        from unittest import mock
        import run as R
        bad = list(bad)
        with tempfile.TemporaryDirectory() as job, \
                mock.patch.object(R.to_aster, "postprocess", lambda meta, raw: {"skip_reac": [], "reac": {}, "forces": {}}), \
                mock.patch.object(R.C, "compare", lambda model, s, a, tol: (bad, {"disp_r": 1.0})):
            with open(os.path.join(job, "result.json"), "w") as f:
                J.dump({}, f)
            r = {"name": "m", "job": job, "sres": {"diags": diags, "issues": list(issues), "forces": {}}, "meta": {"elements": []}, "near_singular": True}
            with mock.patch.object(R, "held_mechanism", lambda model, sres, bad, binary, tol: held(bad)):
                return R.finish(r, 1e-6, None, _mechanism_beam(), "bin")

    def test_unwarned_singular_solve_is_silent(self):
        r = self.finish(["dense_lu", "residual_ok"])
        self.assertEqual(r["status"], "silent_singular")
        self.assertTrue(r["why"])

    def test_warned_singular_solve_is_not_silent(self):
        r = self.finish(["high_diagonal_ratio", "known_issue"], ["NUM-INVARIANCE"])
        self.assertEqual(r["status"], "warned_singular")
        self.assertIn("stabileo warned: high_diagonal_ratio", r["why"])

    def test_a_warned_disagreement_in_forces_is_silent(self):
        for bad in [("reac", 1, "fz", 1.0, 2.0, 1.0), ("force", 1, "mz", 1.0, 2.0, 1.0)]:
            r = self.finish(["high_diagonal_ratio", "known_issue"], ["NUM-INVARIANCE"], [("disp", 5, "rz", 0.0, 1.04e13, 1.0), bad])
            self.assertEqual(r["status"], "silent_singular", bad)

    def test_a_warned_disagreement_that_is_not_a_proven_mechanism_is_silent(self):
        r = self.finish(["high_diagonal_ratio", "known_issue"], ["NUM-INVARIANCE"], held=lambda bad: False)
        self.assertEqual(r["status"], "silent_singular")

    def test_a_conditioning_warning_without_the_known_issue_is_silent(self):
        r = self.finish(["high_diagonal_ratio"])
        self.assertEqual(r["status"], "silent_singular")

    def test_summary_survives_a_result_without_why(self):
        import contextlib
        import io
        import sys as S
        from unittest import mock
        import run as R
        argv = ["run.py", "--bin", os.path.abspath(__file__)]
        with mock.patch.object(S, "argv", argv), mock.patch.object(R, "collect", lambda a: [("m", {})]), \
                mock.patch.object(R, "prepare", lambda *a: {"name": "m", "status": "silent_singular", "max_err": {"disp_r": 1.0}}), \
                contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(R.main(), 1)


if __name__ == "__main__":
    unittest.main()
