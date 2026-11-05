import importlib.util
import json
import re
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("mutants_safety", ROOT / "scripts" / "mutants-safety.py")
ms = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ms)

CFG = {"modules": {
    "certificate": {"files": {"engine/src/certify/linear.rs": []}},
    "design-verdict": {"files": {"engine/src/certify/design.rs": ["certify_members", "around"]}},
}, "tests": ["certify"]}


def outcome(name, file, fn, summary):
    return {"scenario": {"Mutant": {"name": name, "file": file, "function": {"function_name": fn}}}, "summary": summary}


def shard(outcomes):
    d = Path(tempfile.mkdtemp())
    (d / "outcomes.json").write_text(json.dumps({"outcomes": [{"scenario": "Baseline", "summary": "Success"}, *outcomes]}))
    return d


L = "engine/src/certify/linear.rs"
D = "engine/src/certify/design.rs"


class ScopeTest(unittest.TestCase):
    def test_regex_keeps_whole_files_and_only_the_listed_functions(self):
        r = re.compile(ms.regex(CFG))
        self.assertTrue(r.search(f"{L}:10:5: replace + with - in finish"))
        self.assertTrue(r.search(f"{L}:10:5: replace finish -> bool with true"))
        self.assertTrue(r.search(f"{D}:220:9: replace > with < in certify_members"))
        self.assertTrue(r.search(f"{D}:220:5: replace certify_members -> Vec<CertifiedMemberResult> with vec![]"))
        self.assertTrue(r.search(f"{D}:130:5: replace around -> Result<Interval, String> with Ok(Default::default())"))
        self.assertFalse(r.search(f"{D}:900:9: replace * with + in rc_ratio_enclosures"))
        self.assertFalse(r.search(f"{D}:900:5: replace rc_ratio_enclosures -> Result<[Interval; 3], String> with Ok([Default::default(); 3])"))
        self.assertFalse(r.search("engine/src/certify/plastic.rs:1:1: replace + with - in finish"))

    def test_the_repository_scope_names_real_files_and_test_files(self):
        cfg = ms.scope()
        for f in ms.files(cfg):
            self.assertTrue((ROOT / f).exists(), f)
        for t in cfg["tests"]:
            self.assertTrue((ROOT / "engine" / "tests" / f"{t}.rs").exists() or (ROOT / "engine" / "tests" / t).is_dir(), t)
        text = (ROOT / D).read_text()
        for fn in cfg["modules"]["design-verdict"]["files"][D]:
            self.assertRegex(text, rf"\bfn {fn}\b")


class ReportTest(unittest.TestCase):
    def test_kill_rate_per_module_counts_timeouts_as_killed_and_ignores_unviable_and_duplicates(self):
        a = shard([
            outcome(f"{L}:1:1: a", L, "finish", "CaughtMutant"),
            outcome(f"{L}:2:1: b", L, "finish", "MissedMutant"),
            outcome(f"{L}:3:1: c", L, "finish", "Timeout"),
            outcome(f"{L}:4:1: d", L, "finish", "Unviable"),
            outcome(f"{D}:5:1: e", D, "certify_members", "CaughtMutant"),
            outcome(f"{D}:6:1: f", D, "rc_ratio_enclosures", "MissedMutant"),
        ])
        b = shard([outcome(f"{L}:2:1: b", L, "finish", "MissedMutant"), outcome(f"{D}:7:1: g", D, "around", "MissedMutant")])
        mods = ms.report(CFG["modules"], [a, b], lambda f, fn: ms.module_of(CFG, f, fn))
        self.assertEqual({k: mods["certificate"][k] for k in ("tested", "caught", "timeout", "missed", "unviable", "kill_rate")},
                         {"tested": 3, "caught": 1, "timeout": 1, "missed": 1, "unviable": 1, "kill_rate": 0.6667})
        self.assertEqual(mods["design-verdict"]["kill_rate"], 0.5)
        self.assertEqual(mods["design-verdict"]["missed_names"], [f"{D}:7:1: g"])

    def test_areas(self):
        self.assertEqual(ms.area_of("engine/src/solver/linear.rs", "x"), "solver")
        self.assertEqual(ms.area_of("engine/src/element/frame.rs", "x"), "element")
        self.assertEqual(ms.area_of("engine/src/lib.rs", "x"), "other")


class RatchetTest(unittest.TestCase):
    def mods(self, rate, tested=10):
        return {"certificate": {"tested": tested, "missed": 1, "kill_rate": rate}}

    def test_equal_or_better_passes_and_lower_fails(self):
        base = {"modules": {"certificate": {"kill_rate": 0.9}}}
        self.assertEqual(ms.ratchet(self.mods(0.9), base), [])
        self.assertEqual(ms.ratchet(self.mods(0.95), base), [])
        self.assertEqual(len(ms.ratchet(self.mods(0.8999), base)), 1)

    def test_an_untested_module_fails(self):
        base = {"modules": {"certificate": {"kill_rate": 0.9}, "containment": {"kill_rate": 0.5}}}
        self.assertEqual(ms.ratchet(self.mods(0.9), base), ["containment: no mutant was tested (baseline 50.0 %)"])

    def test_the_cli_ratchet_and_record_round_trip(self):
        d = Path(tempfile.mkdtemp())
        rep = {"modules": {"certificate": {"tested": 4, "caught": 3, "timeout": 0, "missed": 1, "unviable": 2, "kill_rate": 0.75, "missed_names": ["x"]}}}
        (d / "r.json").write_text(json.dumps(rep))
        (d / "base.json").write_text(json.dumps({"note": "kept", "modules": {"certificate": {"kill_rate": 0.8}}}))
        self.assertEqual(ms.main(["ratchet", str(d / "r.json"), "--baseline", str(d / "base.json")]), 1)
        self.assertEqual(ms.main(["record", str(d / "r.json"), "--baseline", str(d / "base.json")]), 0)
        base = json.loads((d / "base.json").read_text())
        self.assertEqual(base["note"], "kept")
        self.assertEqual(base["modules"]["certificate"], {"tested": 4, "caught": 3, "timeout": 0, "missed": 1, "unviable": 2, "kill_rate": 0.75})
        self.assertEqual(ms.main(["ratchet", str(d / "r.json"), "--baseline", str(d / "base.json")]), 0)


if __name__ == "__main__":
    unittest.main()
