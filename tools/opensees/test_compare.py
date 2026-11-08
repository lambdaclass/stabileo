import math
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
    def test_end_releases_stay_at_the_member_ends(self):
        d = column()
        d["elements"]["2"].update(hingeStart=True, hingeEnd=True, releaseMyStart=True, releaseTEnd=True)
        m = C.mesh(d, 4)
        z = lambda e: m["nodes"][str(e["nodeI"])]["z"]
        segs = sorted((e for e in m["elements"].values() if e["type"] == "frame" and z(e) >= 3.0), key=z)
        self.assertEqual(len(segs), 4)
        released = lambda e: sorted(f for f in e if f.startswith(("hinge", "release")))
        self.assertEqual(released(segs[0]), ["hingeStart", "releaseMyStart"])
        self.assertEqual([released(s) for s in segs[1:3]], [[], []])
        self.assertEqual(released(segs[3]), ["hingeEnd", "releaseTEnd"])
        self.assertEqual((segs[0]["nodeI"], segs[3]["nodeJ"]), (2, 3))

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

    def test_refusal_reason_reaches_the_filer_without_truncation(self):
        reason = "stabileo: " + "prescribed displacement refusal " * 12
        with mock.patch.object(C, "stabileo", side_effect=RuntimeError(reason)), \
                mock.patch.object(C, "opensees_isolated", return_value={"failed": "reference failed"}):
            result = C.run_one("long-refusal", column(), "bin", 1e-6, False)
        self.assertEqual(result["why"], [reason])
        self.assertGreater(len(result["why"][0]), 200)


MODES = [{1: [1.0, 0.0, 0.0, 0.0, 0.0, 0.0]}, {1: [0.0, 1.0, 0.0, 0.0, 0.0, 0.0]}]


def frames(model):
    return sum(e["type"] == "frame" for e in model["elements"].values())


class RefinedBucklingTest(unittest.TestCase):
    """Engine and OpenSees load factors per number of frame members (2 in the
    unmeshed column): stub solvers, so only the decision logic runs."""

    def run_with(self, stab, ops, axial_span_load=True, omodes=None, fail=None, kappa=None):
        job = {"analysis": "buckling", "numModes": 2, "model": column(axial_span_load)}
        lin = dict(disp={}, reac={}, forces={}, diags=[], issues=[])
        seen = []

        def stabileo_job(j, binary):
            seen.append(frames(j["model"]) // 2)
            if fail == ("stabileo", frames(j["model"]) // 2):
                raise RuntimeError("Singular stiffness matrix")
            return {"values": stab[frames(j["model"]) // 2], "modes": MODES}

        def opensees(j):
            n = frames(j["model"]) // 2
            if fail == ("opensees", n):
                return {"failed": "analyze failed"}
            if fail == ("large", n):
                return {"unsupported": "too large for dense eigen/transient comparison"}
            return {"values": ops[n], "modes": (omodes or {}).get(n, MODES), "dim": 3, "kappa": (kappa or {}).get(n, 1e3),
                    "art_rot": [], "linear": dict(lin, art_rot=[], dim=3)}

        with mock.patch.object(C, "stabileo", return_value={}), \
                mock.patch.object(C, "normalize_stabileo", return_value=lin), \
                mock.patch.object(C, "stabileo_job", side_effect=stabileo_job), \
                mock.patch.object(C, "normalize_ext", side_effect=lambda kind, r, dim: r), \
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

    def test_differences_falling_with_the_mesh_are_converging_and_flagged(self):
        stab = {n: [10.0, 30.0] for n in (1, 2, 4, 8, 16)}
        ops = {n: [10.0 * (1 - 1e-3 / n ** 2), 30.0] for n in (1, 2, 4, 8, 16)}
        r, seen = self.run_with(stab, ops)
        self.assertEqual((r["status"], r["mesh"], seen), ("converging", 4, [1, 2, 4]))
        self.assertIn("n=2: 2.50e-04, n=4: 6.25e-05", r["why"][0])
        self.assertIn("converging", C.FLAGGED)

    def test_a_constant_difference_under_a_falling_one_is_flagged(self):
        stab = {n: [10.0, 30.0] for n in (1, 2, 4, 8, 16)}
        ops = {n: [10.0 * (1 - (1e-4 + 1e-3 / n ** 2)), 30.0] for n in (1, 2, 4, 8, 16)}
        r, _ = self.run_with(stab, ops)
        self.assertIn(r["status"], C.FLAGGED)
        self.assertGreater(r["max_err"]["eig"], 1e-4)

    def test_refinement_continues_while_agreement_is_within_reach(self):
        r, seen = self.run_with(*self.within_reach())
        self.assertEqual((r["status"], r["mesh"], seen), ("ok", 8, [1, 2, 4, 8]))

    def test_differences_that_stop_falling_are_a_mismatch(self):
        stab = {n: [10.0, 30.0] for n in (1, 2, 4, 8, 16)}
        ops = {n: [10.0 * (1 - 1e-3 / min(n, 2) ** 2), 30.0] for n in (1, 2, 4, 8, 16)}
        r, _ = self.run_with(stab, ops)
        self.assertEqual((r["status"], r["mesh"]), ("mismatch", 4))
        self.assertTrue(any("not converging" in str(w[2]) for w in r["worst"]))

    def test_a_close_pair_in_either_order_does_not_stop_convergence(self):
        stab = {n: [10.0, 10.05] for n in (1, 2, 4, 8, 16)}
        ops = {n: [10.0 * (1 - 0.1 / n ** 2), 10.05 * (1 - 0.1 / n ** 2), 30.0] for n in (1, 2, 4, 8, 16)}
        swapped = {n: [MODES[1], MODES[0]] for n in (1, 2, 4, 8, 16)}
        r, _ = self.run_with(stab, ops, omodes=swapped)
        self.assertEqual((r["status"], r["mesh"]), ("converging", 4))

    def test_a_separated_mode_shape_that_stays_different_is_a_mismatch(self):
        stab = {n: [10.0, 30.0] for n in (1, 2, 4, 8, 16)}
        ops = {n: [10.0 * (1 - 1e-3 / n ** 2), 30.0, 50.0] for n in (1, 2, 4, 8, 16)}
        tilted = {n: [{1: [1.0, 0.1, 0.0, 0.0, 0.0, 0.0]}, MODES[1]] for n in (1, 2, 4, 8, 16)}
        r, _ = self.run_with(stab, ops, omodes=tilted)
        self.assertEqual(r["status"], "mismatch")

    def within_reach(self):
        stab = {n: [10.0, 30.0] for n in (1, 2, 4, 8, 16)}
        ops = {1: [9.0, 30.0], 2: [10.0 * (1 - 4e-5), 30.0], 4: [10.0 * (1 - 4e-6), 30.0],
               8: [10.0 * (1 - 4e-7), 30.0], 16: [10.0, 30.0]}
        return stab, ops

    def test_the_engine_failing_on_a_finer_mesh_is_a_mismatch(self):
        r, seen = self.run_with(*self.within_reach(), fail=("stabileo", 8))
        self.assertEqual((r["status"], r["mesh"], seen), ("mismatch", 8, [1, 2, 4, 8]))
        self.assertIn("stabileo failed on the n=8 mesh", r["worst"][0][2])

    def test_opensees_failing_on_a_finer_mesh_keeps_the_mismatch(self):
        r, _ = self.run_with(*self.within_reach(), fail=("opensees", 8))
        self.assertEqual(r["status"], "mismatch")
        self.assertIn(r["status"], C.FLAGGED)
        self.assertTrue(any("n=8" in str(w[2]) and "meshed comparison stopped" in str(w[2]) for w in r["worst"]))

    def test_a_mesh_too_large_for_opensees_ends_the_refinement(self):
        r, _ = self.run_with(*self.within_reach(), fail=("large", 8))
        self.assertEqual((r["status"], r["mesh"]), ("converging", 4))

    def test_a_mode_without_neighbours_keeps_its_shape_difference(self):
        groups = {"eig": 1e-4, "mac": 0.01}
        ores = {"values": [10.0], "dim": 3, "modes": MODES[:1]}
        sres = {"values": [10.001], "modes": MODES[:1]}
        self.assertEqual(C._resolved_differences([("mode", 1, "1-MAC", 0.01, 0.0, 0.01)], sres, ores), {("mode", 1): 0.01})

    def test_a_rotated_basis_of_a_triple_mode_is_the_same_eigenspace(self):
        x, y, z = ({1: [1.0 * (k == m) for k in range(6)]} for m in (0, 1, 2))
        ores = {"values": [10.0, 10.0, 10.0], "dim": 3, "modes": [x, y, z]}
        sres = {"values": [10.01, 10.01, 10.01], "modes": [z, x, y]}
        bad = [("mode", i, "1-MAC", 1.0, 0.0, 1.0) for i in (1, 2, 3)]
        self.assertLess(max(C._resolved_differences(bad, sres, ores).values()), 1e-12)

    def test_a_duplicated_mode_does_not_span_a_pair(self):
        x, y = MODES
        ores = {"values": [10.0, 10.0], "dim": 3, "modes": [x, y]}
        sres = {"values": [10.01, 10.01], "modes": [x, x]}
        bad = [("mode", 2, "1-MAC", 1.0, 0.0, 1.0)]
        self.assertEqual(C._resolved_differences(bad, sres, ores), {("mode", 2): 1.0})

    def test_a_shape_difference_that_stays_while_factors_converge_is_a_mismatch(self):
        stab = {n: [10.0, 30.0] for n in (1, 2, 4, 8, 16)}
        ops = {n: [10.0 * (1 - 1e-3 / n ** 2), 30.0, 50.0] for n in (1, 2, 4, 8, 16)}
        c, s_ = math.sqrt(1 - 4e-6), math.sqrt(4e-6)
        tilted = {n: [{1: [c, s_, 0.0, 0.0, 0.0, 0.0]}, MODES[1]] for n in (1, 2, 4, 8, 16)}
        r, _ = self.run_with(stab, ops, omodes=tilted)
        self.assertEqual(r["status"], "mismatch")

    def test_a_repeated_mode_in_either_basis_agrees_on_a_common_mesh(self):
        stab = {n: [10.0, 10.0] for n in (1, 2, 4, 8, 16)}
        ops = {1: [9.0, 9.0], **{n: [10.0, 10.0] for n in (2, 4, 8, 16)}}
        h = math.sqrt(0.5)
        rotated = {n: [{1: [h, h, 0.0, 0.0, 0.0, 0.0]}, {1: [h, -h, 0.0, 0.0, 0.0, 0.0]}] for n in (1, 2, 4, 8, 16)}
        r, seen = self.run_with(stab, ops, omodes=rotated)
        self.assertEqual((r["status"], r["mesh"], seen), ("ok", 2, [1, 2]))
        self.assertLess(r["max_err"]["mac"], 1e-12)

    def test_a_separated_mode_is_not_excused_by_another_modes_error(self):
        ores = {"values": [10.0, 10.5, 30.0], "dim": 3, "modes": [MODES[0], MODES[1], {1: [0.0, 0.0, 1.0, 0.0, 0.0, 0.0]}]}
        sres = {"values": [10.0, 10.5, 33.0], "modes": [MODES[1], MODES[1], ores["modes"][2]]}
        bad = [("mode", 1, "1-MAC", 1.0, 0.0, 1.0)]
        self.assertEqual(C._resolved_differences(bad, sres, ores), {("mode", 1): 1.0})

    def test_meshes_compare_at_the_tolerance_of_the_unmeshed_model(self):
        stab = {n: [10.0, 30.0] for n in (1, 2, 4, 8, 16)}
        ops = {1: [9.0, 30.0], **{n: [10.0 * (1 - 4e-6), 30.0] for n in (2, 4, 8, 16)}}
        with mock.patch.object(C, "KAPPA_MAX", 1e30):
            r, seen = self.run_with(stab, ops, kappa={1: 1e3, 2: 1e3, 4: 1e10})
        self.assertEqual((r["status"], seen), ("mismatch", [1, 2, 4]))

    def test_a_close_pair_spanning_other_shapes_is_a_mismatch(self):
        stab = {n: [10.0, 10.05] for n in (1, 2, 4, 8, 16)}
        ops = {n: [10.0 * (1 - 0.1 / n ** 2), 10.05 * (1 - 0.1 / n ** 2), 30.0] for n in (1, 2, 4, 8, 16)}
        other = [{1: [0.0, 0.0, 1.0, 0.0, 0.0, 0.0]}, {1: [0.0, 0.0, 0.0, 1.0, 0.0, 0.0]}]
        r, _ = self.run_with(stab, ops, omodes={n: other for n in (1, 2, 4, 8, 16)})
        self.assertEqual(r["status"], "mismatch")

    def test_without_an_axial_span_load_a_one_element_mismatch_stands(self):
        r, seen = self.run_with({1: [10.0, 30.0], 2: [10.0, 30.0]}, {1: [10.1, 30.0], 2: [10.0, 30.0]},
                                axial_span_load=False)
        self.assertEqual((r["status"], seen), ("mismatch", [1]))

    def test_a_missing_mode_on_the_mesh_is_never_converging(self):
        stab = {1: [10.0, 30.0], 2: [10.0], 4: [10.0], 8: [10.0], 16: [10.0]}
        ops = {n: [10.0 * (1 - 1e-3 / n ** 2), 30.0] for n in (1, 2, 4, 8, 16)}
        r, _ = self.run_with(stab, ops)
        self.assertEqual(r["status"], "mismatch")


class ProgressTest(unittest.TestCase):
    RUNNER = """
import sys, time
sys.path.insert(0, sys.argv[1])
import compare as C
def run_one(name, model, *rest):
    if name == "b.json":
        time.sleep(600)
    return dict(name=name, status="ok", max_err={})
C.run_one = run_one
sys.argv = ["compare.py", *sys.argv[2:]]
sys.exit(C.main())
"""

    def test_a_killed_run_leaves_a_parseable_progress_log(self):
        import json
        import signal
        import subprocess
        import tempfile
        import time
        with tempfile.TemporaryDirectory() as tmp:
            for name in ("a.json", "b.json", "c.json"):
                with open(os.path.join(tmp, name), "w") as f:
                    json.dump(column(), f)
            binary = os.path.join(tmp, "solve_json")
            open(binary, "w").close()
            report = os.path.join(tmp, "report.json")
            log = report + ".progress.jsonl"
            proc = subprocess.Popen(
                [sys.executable, "-I", "-c", self.RUNNER, os.path.dirname(os.path.abspath(__file__)),
                 *(os.path.join(tmp, n) for n in ("a.json", "b.json", "c.json")),
                 "--bin", binary, "--report", report, "-j", "1"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                deadline = time.monotonic() + 30
                while time.monotonic() < deadline:
                    if os.path.exists(log) and '"start", "name": "b.json"' in open(log).read():
                        break
                    time.sleep(0.05)
                proc.send_signal(signal.SIGKILL)
            finally:
                proc.wait()
            self.assertFalse(os.path.exists(report))
            rows = [json.loads(line) for line in open(log).read().splitlines()]
            self.assertEqual(rows[0]["event"], "begin")
            self.assertEqual(rows[0]["total"], 3)
            done = [r for r in rows if r["event"] == "done"]
            self.assertEqual([(r["name"], r["status"]) for r in done], [("a.json", "ok")])
            self.assertGreaterEqual(done[0]["seconds"], 0.0)
            started = {r["name"] for r in rows if r["event"] == "start"}
            self.assertEqual(started - {r["name"] for r in done}, {"b.json"})
            self.assertNotIn("end", [r["event"] for r in rows])

    def test_a_finished_run_records_each_model_time_in_the_report(self):
        import json
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "a.json")
            with open(path, "w") as f:
                json.dump(column(), f)
            binary = os.path.join(tmp, "solve_json")
            open(binary, "w").close()
            report = os.path.join(tmp, "report.json")
            ok = lambda name, *rest: dict(name=name, status="ok", max_err={})
            with mock.patch.object(C, "run_one", ok), mock.patch.object(sys, "argv", ["compare.py", path, "--bin", binary, "--report", report]), \
                    mock.patch("sys.stdout"):
                self.assertEqual(C.main(), 0)
            rows = json.load(open(report))
            self.assertEqual(rows[0]["name"], "a.json")
            self.assertGreaterEqual(rows[0]["seconds"], 0.0)
            events = [json.loads(line)["event"] for line in open(report + ".progress.jsonl")]
            self.assertEqual(events, ["begin", "start", "done", "end"])


if __name__ == "__main__":
    unittest.main()
