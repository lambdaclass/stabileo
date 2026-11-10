import argparse
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location("plastic_replay", Path(__file__).with_name("replay-plastic-budget.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reports", type=Path)
    parser.add_argument("--summary", type=Path)
    args = parser.parse_args()
    corpus = Path("engine/fuzz/corpus-regressions/plastic-lp-budget")
    files = sorted(corpus.glob("issue-*.bin"))
    assert len(files) == 14
    summary = []
    for artifact in files:
        number = int(artifact.stem.split("-")[1])
        if args.reports:
            result = json.loads((args.reports / f"after-engine-{number}.json").read_text())
        else:
            result = module.replay(Path("engine/fuzz/target/release/examples/plastic_replay"),
                                   artifact, mode="engine", repeats=3)
        assert result["failure"] is None, result
        assert result["exit_code"] == 0, result
        assert len(result["iterations"]) >= 3, result
        for row in result["iterations"]:
            assert row["live_before"] == row["live_after"], result
            if number == 1261:
                assert row["outcome"].startswith("error: "), result
                refusal = json.loads(row["outcome"][len("error: "):])
                assert any(d.get("phase") == "PL-2D-INVARIANCE" and d.get("severity") == "error"
                           for d in refusal["structuredDiagnostics"]), result
                continue
            assert row["outcome"].startswith("ok: "), result
            certificate = json.loads(row["outcome"][len("ok: "):])
            assert certificate["certified"] is True, result
            assert certificate["solverWithinBounds"] is False, result
            assert certificate["solverCollapseFactor"] < certificate["lambdaLower"], result
            assert certificate["returnedCollapseFactor"] == certificate["lambdaLower"], result
            assert any("certified lower bound" in warning for warning in certificate["solverWarnings"]), result
            assert any("PL-3D-CERTIFICATE-MISMATCH" in warning
                       and str(certificate["solverCollapseFactor"]) in warning
                       for warning in certificate["solverWarnings"]), result
            assert any(d.get("phase") == "PL-3D-CERTIFICATE-MISMATCH" and d.get("severity") == "warning"
                       for d in certificate["solverDiagnostics"]), result
        if number == 1261:
            summary.append({"issue": number, "outcome": "PL-2D-INVARIANCE", "calls": len(result["iterations"]), "retainedBytes": 0})
            print(f"#{number}: repeated engine refusal PL-2D-INVARIANCE, no retained allocation", flush=True)
        else:
            summary.append({"issue": number, "rawFactor": certificate["solverCollapseFactor"],
                            "lambdaLower": certificate["lambdaLower"], "lambdaUpper": certificate["lambdaUpper"],
                            "returnedFactor": certificate["returnedCollapseFactor"],
                            "solverWithinBounds": certificate["solverWithinBounds"],
                            "calls": len(result["iterations"]), "retainedBytes": 0})
            print(f"#{number}: returned certified lower {certificate['lambdaLower']}, raw mismatch warned, no retained allocation", flush=True)
    if args.summary:
        args.summary.write_text(json.dumps(summary, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
