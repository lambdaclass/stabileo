"""Negative tests for catalog.py: each mutation of a valid entry must be rejected.

  python3 -I research/tools/test_catalog.py [--online]
"""
import copy
import os
import subprocess
import sys
import tempfile

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
CATALOG = os.path.join(os.path.dirname(HERE), "papers.yaml")


def run(papers, *flags):
    with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as f:
        yaml.safe_dump({"papers": papers}, f)
    env = dict(os.environ, RESEARCH_CATALOG=f.name)
    r = subprocess.run([sys.executable, "-I", os.path.join(HERE, "catalog.py"), "check", *flags],
                       env=env, capture_output=True, text=True)
    os.unlink(f.name)
    return r.returncode, r.stdout


def main():
    online = "--online" in sys.argv
    papers = yaml.safe_load(open(CATALOG))["papers"]
    base = [p for p in papers if p["id"] == "shauer-2025"]
    flags = () if online else ("--offline",)
    code, out = run(base, *flags)
    assert code == 0, out

    def mutated(f):
        m = copy.deepcopy(base)
        f(m[0])
        return m

    cases = {
        "unknown area": lambda p: p.update(area="astrology"),
        "unknown status": lambda p: p.update(status="certified"),
        "missing summary": lambda p: p.pop("summary"),
        "contact without source": lambda p: p.update(contacts=[{"name": "X"}]),
        "validated without evidence": lambda p: p.update(status="numerically-validated", implementation="templates"),
        "duplicate id": None,
        "summary from memory": lambda p: p.update(summary_source="title and prior knowledge"),
        "summary without source": lambda p: p.update(summary_source=None),
    }
    if online:
        cases["wrong year"] = lambda p: p["crossref"].update(year=1999)
        cases["wrong author"] = lambda p: p["crossref"].update(authors=["Someone Else"])
        cases["unknown DOI"] = lambda p: p.update(doi="10.9999/does-not-exist-stabileo")
    failures = 0
    for name, f in cases.items():
        papers_m = base + copy.deepcopy(base) if f is None else mutated(f)
        code, out = run(papers_m, *flags)
        ok = code != 0
        failures += not ok
        print(("ok  " if ok else "FAIL"), "rejects", name)
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
