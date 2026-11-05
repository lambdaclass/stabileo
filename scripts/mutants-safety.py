#!/usr/bin/env python3
"""The safety-critical mutation scope (scripts/mutants-safety.json) and its kill-rate ratchet.

    scripts/mutants-safety.py files | tests | regex
    scripts/mutants-safety.py report MUTANTS_OUT... [--json OUT] [--markdown OUT]
    scripts/mutants-safety.py ratchet REPORT_JSON [--baseline FILE] [--markdown OUT]
    scripts/mutants-safety.py record REPORT_JSON [--baseline FILE]

`files`, `tests` and `regex` feed scripts/mutants.sh (MUTANTS_SCOPE=safety). `report` reads the
outcomes.json of one or more cargo-mutants output directories (the shards of one run) and counts,
per module, caught, missed, timeout and unviable mutants. The kill rate is
(caught + timeout) / (caught + timeout + missed): a timeout is a mutant the tests stopped, an
unviable one never built. `ratchet` exits 1 when a module's kill rate is below the baseline
(docs/verification/mutants-baseline.json), or when a module the baseline lists was not tested; `record` writes the report as the new baseline.
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCOPE = ROOT / "scripts" / "mutants-safety.json"
BASELINE = ROOT / "docs" / "verification" / "mutants-baseline.json"
NAME = re.compile(r"^(?P<file>[^:]+):\d+:\d+: .* in (?P<fn>.+)$")


def scope(path=SCOPE):
    return json.loads(Path(path).read_text())


def files(cfg):
    return [f for m in cfg["modules"].values() for f in m["files"]]


def regex(cfg):
    whole, parts = [], []
    for m in cfg["modules"].values():
        for f, fns in m["files"].items():
            if fns:
                alts = "|".join(re.escape(fn) for fn in fns)
                parts.append(f"^{re.escape(f)}:.* in (?:[^:]*::)?(?:{alts})$")
            else:
                whole.append(re.escape(f))
    if whole:
        parts.insert(0, f"^(?:{'|'.join(whole)}):")
    return "|".join(parts)


def module_of(cfg, name):
    m = NAME.match(name)
    if not m:
        return None
    file, fn = m["file"], m["fn"]
    short = fn.rsplit("::", 1)[-1]
    for mod, spec in cfg["modules"].items():
        fns = spec["files"].get(file)
        if fns is None:
            continue
        if not fns or short in fns:
            return mod
    return None


def outcome_name(o):
    s = o.get("scenario")
    if isinstance(s, dict):
        mutant = s.get("Mutant") or {}
        if "name" in mutant:
            return mutant["name"]
        loc = mutant.get("span", {}).get("start", {})
        fn = (mutant.get("function") or {}).get("function_name", "")
        return f"{mutant.get('file')}:{loc.get('line')}:{loc.get('column')}: replace {mutant.get('replacement', '')} in {fn}"
    return None


SUMMARY = {"CaughtMutant": "caught", "MissedMutant": "missed", "Timeout": "timeout", "Unviable": "unviable"}


def report(cfg, outs):
    mods = {m: {"caught": 0, "missed": 0, "timeout": 0, "unviable": 0, "missed_names": []} for m in cfg["modules"]}
    seen = set()
    for out in outs:
        data = json.loads((Path(out) / "outcomes.json").read_text())
        for o in data.get("outcomes", []):
            if o.get("scenario") == "Baseline":
                continue
            name = outcome_name(o)
            kind = SUMMARY.get(o.get("summary"))
            if not name or not kind or name in seen:
                continue
            seen.add(name)
            mod = module_of(cfg, name)
            if mod is None:
                continue
            mods[mod][kind] += 1
            if kind == "missed":
                mods[mod]["missed_names"].append(name)
    for v in mods.values():
        v["missed_names"].sort()
        tested = v["caught"] + v["timeout"] + v["missed"]
        v["tested"] = tested
        v["kill_rate"] = round((v["caught"] + v["timeout"]) / tested, 4) if tested else None
    return mods


def markdown(mods, baseline=None):
    rows = ["| module | tested | caught | timeout | missed | unviable | kill rate | baseline |", "|---|---:|---:|---:|---:|---:|---:|---:|"]
    for m, v in mods.items():
        rate = "-" if v["kill_rate"] is None else f"{100 * v['kill_rate']:.1f} %"
        base = (baseline or {}).get("modules", {}).get(m, {}).get("kill_rate")
        base = "-" if base is None else f"{100 * base:.1f} %"
        rows.append(f"| {m} | {v['tested']} | {v['caught']} | {v['timeout']} | {v['missed']} | {v['unviable']} | {rate} | {base} |")
    return "\n".join(rows) + "\n"


def ratchet(mods, baseline):
    drops = []
    for m, b in baseline.get("modules", {}).items():
        base = b.get("kill_rate")
        if base is None:
            continue
        v = mods.get(m)
        if not v or not v["tested"]:
            drops.append(f"{m}: no mutant was tested (baseline {100 * base:.1f} %)")
            continue
        if v["kill_rate"] < base - 1e-9:
            drops.append(f"{m}: kill rate {100 * v['kill_rate']:.1f} % < baseline {100 * base:.1f} % ({v['missed']} missed of {v['tested']})")
    return drops


def main(argv):
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    for c in ("files", "tests", "regex"):
        sub.add_parser(c)
    r = sub.add_parser("report")
    r.add_argument("outs", nargs="+")
    r.add_argument("--json")
    r.add_argument("--markdown")
    r.add_argument("--baseline", default=str(BASELINE))
    k = sub.add_parser("ratchet")
    k.add_argument("report")
    k.add_argument("--baseline", default=str(BASELINE))
    k.add_argument("--markdown")
    w = sub.add_parser("record")
    w.add_argument("report")
    w.add_argument("--baseline", default=str(BASELINE))
    a = p.parse_args(argv)
    cfg = scope()
    if a.cmd == "files":
        print("\n".join(files(cfg)))
    elif a.cmd == "tests":
        print("\n".join(cfg["tests"]))
    elif a.cmd == "regex":
        print(regex(cfg))
    elif a.cmd == "report":
        outs = [o for o in a.outs if (Path(o) / "outcomes.json").exists()]
        if not outs:
            print("mutants-safety: no outcomes.json in " + " ".join(a.outs), file=sys.stderr)
            return 1
        mods = report(cfg, outs)
        base = json.loads(Path(a.baseline).read_text()) if Path(a.baseline).exists() else None
        text = markdown(mods, base)
        print(text)
        if a.json:
            Path(a.json).write_text(json.dumps({"modules": mods}, indent=2) + "\n")
        if a.markdown:
            Path(a.markdown).write_text(text)
    elif a.cmd == "ratchet":
        mods = json.loads(Path(a.report).read_text())["modules"]
        baseline = json.loads(Path(a.baseline).read_text())
        drops = ratchet(mods, baseline)
        text = markdown(mods, baseline)
        if drops:
            text += "\nBelow the baseline:\n\n" + "\n".join(f"- {d}" for d in drops) + "\n"
        print(text)
        if a.markdown:
            Path(a.markdown).write_text(text)
        return 1 if drops else 0
    elif a.cmd == "record":
        mods = json.loads(Path(a.report).read_text())["modules"]
        old = json.loads(Path(a.baseline).read_text()) if Path(a.baseline).exists() else {}
        new = {k: v for k, v in old.items() if k != "modules"}
        new["modules"] = {m: {k: v[k] for k in ("tested", "caught", "timeout", "missed", "unviable", "kill_rate")} for m, v in mods.items()}
        Path(a.baseline).write_text(json.dumps(new, indent=2, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
