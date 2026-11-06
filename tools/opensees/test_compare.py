import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import compare as C  # noqa: E402


def column(axial_span_load=True):
    q = {"elementId": 2, "qYI": 0.0, "qYJ": 0.0, "qZI": 0.0, "qZJ": 0.0}
    if axial_span_load:
        q.update(qXI=-4.0, qXJ=-4.0)
    return {
        "nodes": {str(i): {"id": i, "x": 0.0, "y": 0.0, "z": 3.0 * (i - 1)} for i in (1, 2, 3)},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-5, "iz": 2e-5, "j": 3e-5}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
            "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1},
            "3": {"id": 3, "type": "truss", "nodeI": 1, "nodeJ": 3, "materialId": 1, "sectionId": 1},
        },
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}},
        "loads": [{"type": "distributed", "data": q},
                  {"type": "nodal", "data": {"nodeId": 3, "fx": 0.0, "fy": 0.0, "fz": -50.0,
                                             "mx": 0.0, "my": 0.0, "mz": 0.0}}],
    }


class MeshTest(unittest.TestCase):
    def test_one_element_is_the_model_itself(self):
        d = column()
        self.assertIs(C.mesh(d, 1), d)

    def test_frames_split_into_equal_collinear_members_and_trusses_stay_whole(self):
        d = column()
        m = C.mesh(d, 4)
        self.assertEqual(len(d["elements"]), 3)
        frames = [e for e in m["elements"].values() if e["type"] == "frame"]
        trusses = [e for e in m["elements"].values() if e["type"] == "truss"]
        self.assertEqual(len(frames), 8)
        self.assertEqual([(e["nodeI"], e["nodeJ"]) for e in trusses], [(1, 3)])
        self.assertEqual(len({e["id"] for e in m["elements"].values()}), 9)
        self.assertEqual(len(m["nodes"]), 3 + 2 * 3)
        nodes = {n["id"]: n for n in m["nodes"].values()}
        for e in frames:
            pi, pj = nodes[e["nodeI"]], nodes[e["nodeJ"]]
            self.assertEqual((pi["x"], pi["y"], pj["x"], pj["y"]), (0.0, 0.0, 0.0, 0.0))
            self.assertAlmostEqual(pj["z"] - pi["z"], 0.75, places=12)
        self.assertEqual(sorted(nodes[n]["z"] for e in frames for n in (e["nodeI"], e["nodeJ"])).count(3.0), 2)

    def test_member_loads_follow_every_piece(self):
        m = C.mesh(column(), 2)
        dist = [ld["data"] for ld in m["loads"] if ld["type"] == "distributed"]
        top = {e["id"] for e in m["elements"].values()
               if e["type"] == "frame" and m["nodes"][str(e["nodeI"])]["z"] >= 3.0}
        self.assertEqual({x["elementId"] for x in dist}, top)
        self.assertTrue(all(x["qXI"] == x["qXJ"] == -4.0 for x in dist))
        self.assertEqual([ld["data"]["nodeId"] for ld in m["loads"] if ld["type"] == "nodal"], [3])

    def test_axial_span_load_is_detected_on_frames_only(self):
        self.assertTrue(C._axial_span_loaded(column()))
        self.assertFalse(C._axial_span_loaded(column(axial_span_load=False)))
        d = column()
        d["loads"][0]["data"]["elementId"] = 3
        self.assertFalse(C._axial_span_loaded(d))


MODES = [{1: [1.0, 0.0, 0.0, 0.0, 0.0, 0.0]}, {1: [0.0, 1.0, 0.0, 0.0, 0.0, 0.0]}]


def frames(model):
    return sum(e["type"] == "frame" for e in model["elements"].values())


class RefinedBucklingTest(unittest.TestCase):
    """Engine and OpenSees load factors per number of frame members (2 in the
    unmeshed column): stub solvers, so only the decision logic runs."""

    def run_with(self, stab, ops, axial_span_load=True):
        job = {"analysis": "buckling", "numModes": 2, "model": column(axial_span_load)}
        lin = dict(disp={}, reac={}, forces={}, diags=[], issues=[])
        seen = []

        def stabileo_job(j, binary):
            seen.append(frames(j["model"]) // 2)
            return {"values": stab[frames(j["model"]) // 2]}

        def opensees(j):
            return {"values": ops[frames(j["model"]) // 2], "modes": MODES, "dim": 3, "kappa": 1e3,
                    "art_rot": [], "linear": dict(lin, art_rot=[], dim=3)}

        with mock.patch.object(C, "stabileo", return_value={}), \
                mock.patch.object(C, "normalize_stabileo", return_value=lin), \
                mock.patch.object(C, "stabileo_job", side_effect=stabileo_job), \
                mock.patch.object(C, "normalize_ext", side_effect=lambda kind, r, dim: dict(r, modes=MODES)), \
                mock.patch.object(C, "opensees_isolated", side_effect=opensees), \
                mock.patch.object(C, "compare", return_value=([], {})):
            return C.run_ext("buckling3d-1", job, "bin", 1e-6), seen

    def test_one_element_agreement_needs_no_mesh(self):
        r, seen = self.run_with({1: [10.0, 30.0]}, {1: [10.0, 30.0]})
        self.assertEqual((r["status"], seen), ("ok", [1]))
        self.assertNotIn("mesh", r)

    def test_agreement_on_a_common_mesh_is_ok(self):
        r, seen = self.run_with({1: [10.0, 30.0], 2: [9.5, 29.0]}, {1: [9.0, 30.0], 2: [9.5 * (1 + 5e-7), 29.0]})
        self.assertEqual((r["status"], r["mesh"], seen), ("ok", 2, [1, 2]))
        self.assertLess(r["max_err"]["eig"], 1e-6)

    def test_differences_falling_with_the_mesh_are_converging_not_ok(self):
        stab = {n: [10.0, 30.0] for n in (1, 2, 4, 8, 16)}
        ops = {n: [10.0 * (1 - 1e-3 / n ** 2), 30.0] for n in (1, 2, 4, 8, 16)}
        r, seen = self.run_with(stab, ops)
        self.assertEqual((r["status"], r["mesh"], seen), ("converging", 16, [1, 2, 4, 8, 16]))
        self.assertIn("n=2: 2.50e-04", r["why"][0])
        self.assertNotIn("converging", C.FLAGGED)

    def test_differences_that_stop_falling_are_a_mismatch(self):
        stab = {n: [10.0, 30.0] for n in (1, 2, 4, 8, 16)}
        ops = {n: [10.0 * (1 - 1e-3 / min(n, 4) ** 2), 30.0] for n in (1, 2, 4, 8, 16)}
        r, _ = self.run_with(stab, ops)
        self.assertEqual((r["status"], r["mesh"]), ("mismatch", 16))
        self.assertTrue(any("not converging" in str(w[2]) for w in r["worst"]))

    def test_without_an_axial_span_load_a_one_element_mismatch_stands(self):
        r, seen = self.run_with({1: [10.0, 30.0], 2: [10.0, 30.0]}, {1: [10.1, 30.0], 2: [10.0, 30.0]},
                                axial_span_load=False)
        self.assertEqual((r["status"], seen), ("mismatch", [1]))

    def test_a_missing_mode_on_the_mesh_is_never_converging(self):
        stab = {1: [10.0, 30.0], 2: [10.0], 4: [10.0], 8: [10.0], 16: [10.0]}
        ops = {n: [10.0 * (1 - 1e-3 / n ** 2), 30.0] for n in (1, 2, 4, 8, 16)}
        r, _ = self.run_with(stab, ops)
        self.assertEqual(r["status"], "mismatch")


if __name__ == "__main__":
    unittest.main()
