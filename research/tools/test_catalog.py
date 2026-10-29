"""Negative tests for catalog.py: each mutation of a valid entry must be rejected.

  python3 -I research/tools/test_catalog.py [--online]
"""
import hashlib
import copy
import importlib.util
import json
from pathlib import Path
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

    code, out = run(mutated(lambda p: p.update(status="published-figures-compared")), *flags)
    assert code != 0, out
    print("ok   rejects published-figures-compared without published evidence")

    spec = importlib.util.spec_from_file_location("catalog", os.path.join(HERE, "catalog.py"))
    catalog = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(catalog)
    urls = []
    catalog.get_json = lambda url: urls.append(url) or {"license": {"spdx_id": "MIT"}}
    errors = []
    catalog.check_links(base[0], errors)
    assert not errors, errors
    assert urls == [c["url"].replace("https://github.com/", "https://api.github.com/repos/")
                    + "/license?ref=" + c["commit"] for c in base[0]["code"]], urls
    assert base[0]["code"][0]["commit"] == json.loads((Path(CATALOG).parent / base[0]["implementation"] / "reference-results/MANIFEST.json").read_text())["reference_code"]["commit"]
    print("ok   licence requests use pinned commits, including the reproduced manifest revision")
    marked = copy.deepcopy(base)
    marked[0]["crossref"]["title"] = "A <i>phase-field</i> method"
    assert json.loads(catalog.export_text(marked))["papers"][0]["crossref"]["title"] == "A phase-field method"
    assert marked[0]["crossref"]["title"] == "A <i>phase-field</i> method"
    with tempfile.TemporaryDirectory() as tmp:
        catalog.ROOT = os.path.join(tmp, "research")
        implementation = Path(catalog.ROOT) / base[0]["implementation"]
        (implementation / "reference-results").mkdir(parents=True)
        reference = implementation / "reference-results/data.csv"
        reference.write_text("reference")
        manifest = implementation / "reference-results/MANIFEST.json"
        manifest_text = json.dumps({"files_sha256": {"data.csv": hashlib.sha256(reference.read_bytes()).hexdigest()}})
        manifest.write_text(manifest_text)
        (implementation / "VALIDATION.json").write_text(json.dumps({"checks": [{"passed": True, "metric": "error", "observed": 0, "tolerance": 0.01}]}))
        comparison = implementation / "PUBLISHED_COMPARISON.json"
        comparison.write_text(json.dumps({"checks": [{"source": "paper figure 3", "metric": "relative error", "observed": 0.001, "tolerance": 0.01, "passed": True}]}))
        entry = mutated(lambda p: p.update(status="published-figures-compared", reproduced_published_results=True))[0]
        errors = []
        catalog.check_entry(entry, errors)
        assert not errors, errors
        entry["reproduced_published_results"] = False
        catalog.check_entry(entry, errors)
        assert errors
        entry["reproduced_published_results"] = True
        comparison.write_text('{"checks": []}')
        errors = []
        catalog.check_entry(entry, errors)
        assert errors
        (Path(tmp) / "page.svelte").write_text("<h1>Experiment</h1>")
        entry.update(status="interactive", page="page.svelte", reproduced_published_results=False)
        errors = []
        catalog.check_entry(entry, errors)
        assert not errors, errors
        entry["reproduced_published_results"] = True
        errors = []
        catalog.check_entry(entry, errors)
        assert errors, "interactive published claim needs comparison evidence"
        entry["reproduced_published_results"] = False
        for bad in [{}, {"files_sha256": {}}, {"files_sha256": {"data.csv": "invalid"}}, {"files_sha256": {"data.csv": "0" * 64}}]:
            manifest.write_text(json.dumps(bad))
            errors = []
            catalog.check_entry(entry, errors)
            assert errors, bad
        manifest.write_text(manifest_text)
        (implementation / "VALIDATION.json").write_text('{"checks": []}')
        errors = []
        catalog.check_entry(entry, errors)
        assert errors, "empty validation checks"
        for change in [{"passed": "false"}, {"passed": 1}, {"tolerance": -1}, {"observed": True}, {"observed": 1}, {"observed": float("nan")}]:
            check = {"passed": True, "metric": "error", "observed": 0, "tolerance": 0.01, **change}
            (implementation / "VALIDATION.json").write_text(json.dumps({"checks": [check]}))
            errors = []
            catalog.check_entry(entry, errors)
            assert errors, change
    print("ok   validates status-specific evidence and strips display title markup")

    for host in ["github.com", "gitlab.com", "zenodo.org", "doi.org"]:
        code, out = run(mutated(lambda p: p["code"][0].update(url=f"https://{host}/example")), "--offline")
        assert code == 0, out
    for url in ["javascript:alert(1)", "data:text/html,test", "http://github.com/example",
                "https://unknown.example/repo", "https://github.com.evil.example/repo",
                "https://github.com@evil.example/repo", "https://github.com:invalid/repo", None]:
        code, out = run(mutated(lambda p: p["code"][0].update(url=url)), "--offline")
        assert code != 0 and "code URL must use HTTPS" in out, (url, out)
        print("ok   rejects code URL", repr(url))

    cases = {
        "string boolean": lambda p: p.update(reproduced_published_results="false"),
        "integer boolean": lambda p: p.update(reproduced_published_results=1),
        "published claim without comparison": lambda p: p.update(status="published-figures-compared", reproduced_published_results=True),
        "interactive without page": lambda p: p.update(status="interactive"),
        "interactive missing page": lambda p: p.update(status="interactive", page="web/src/components/research/Missing.svelte"),
        "missing code commit": lambda p: p["code"][0].pop("commit"),
        "mutable code ref": lambda p: p["code"][0].update(commit="main"),
        "unknown area": lambda p: p.update(area="astrology"),
        "unknown status": lambda p: p.update(status="certified"),
        "missing summary": lambda p: p.pop("summary"),
        "contact without source": lambda p: p.update(contacts=[{"name": "X"}]),
        "validated without evidence": lambda p: p.update(status="numerically-validated", implementation="templates"),
        "duplicate id": None,
        "summary from reference code": lambda p: p.update(summary="unsupported summary", summary_source="reference-code"),
        "summary from memory": lambda p: p.update(summary="unsupported summary", summary_source="title and prior knowledge"),
        "summary without source": lambda p: p.update(summary="unsupported summary", summary_source=None),
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
