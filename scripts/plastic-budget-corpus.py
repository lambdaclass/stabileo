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
    args = parser.parse_args()
    corpus = Path("engine/fuzz/corpus-regressions/plastic-lp-budget")
    files = sorted(corpus.glob("issue-*.bin"))
    assert len(files) == 14
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
        expected = "PL-2D-INVARIANCE" if number == 1261 else "PL-3D-CERTIFICATE-MISMATCH"
        for row in result["iterations"]:
            assert row["live_before"] == row["live_after"], result
            assert row["outcome"].startswith("error: "), result
            refusal = json.loads(row["outcome"][len("error: "):])
            assert any(d.get("phase") == expected and d.get("severity") == "error"
                       for d in refusal["structuredDiagnostics"]), result
        print(f"#{number}: repeated engine refusal {expected}, no retained allocation", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
