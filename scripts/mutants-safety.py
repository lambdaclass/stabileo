#!/usr/bin/env python3
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCOPE = ROOT / "scripts" / "mutants-safety.json"
BASELINE = ROOT / "docs" / "verification" / "mutants-baseline.json"
AREAS = {"certify": "engine/src/certify/", "solver": "engine/src/solver/", "element": "engine/src/element/"}


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
                parts.append(f"^{re.escape(f)}:.* in (?:[^ ]*::)?(?:{alts})$")
                parts.append(f"^{re.escape(f)}:\\d+:\\d+: replace (?:[^ ]*::)?(?:{alts}) -> ")
            else:
                whole.append(re.escape(f))
    if whole:
        parts.insert(0, f"^(?:{'|'.join(whole)}):")
    return "|".join(parts)


def module_of(cfg, file, fn):
    short = (fn or "").rsplit("::", 1)[-1]
    for mod, spec in cfg["modules"].items():
        fns = spec["files"].get(file)
        if fns is None:
            continue
        if not fns or short in fns:
            return mod
    return None


def area_of(file, fn):
    return next((a for a, prefix in AREAS.items() if file.startswith(prefix)), "other")


def mutant_of(o):
    s = o.get("scenario")
    if not isinstance(s, dict) or "Mutant" not in s:
        return None
    m = s["Mutant"]
    return m.get("name"), m.get("file", ""), (m.get("function") or {}).get("function_name", "")


SUMMARY = {"CaughtMutant": "caught", "MissedMutant": "missed", "Timeout": "timeout", "Unviable": "unviable"}


def report(modules, outs, classify):
    mods = {m: {"caught": 0, "missed": 0, "timeout": 0, "unviable": 0, "missed_names": []} for m in modules}
    seen = set()
    for out in outs:
        data = json.loads((Path(out) / "outcomes.json").read_text())
        for o in data.get("outcomes", []):
            mutant = mutant_of(o)
            kind = SUMMARY.get(o.get("summary"))
            if not mutant or not kind or mutant[0] in seen:
                continue
            seen.add(mutant[0])
            mod = classify(mutant[1], mutant[2])
            if mod not in mods:
                continue
            mods[mod][kind] += 1
            if kind == "missed":
                mods[mod]["missed_names"].append(mutant[0])
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
    ar = sub.add_parser("areas")
    ar.add_argument("root")
    ar.add_argument("--markdown")
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
        mods = report(cfg["modules"], outs, lambda f, fn: module_of(cfg, f, fn))
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
    elif a.cmd == "areas":
        outs = sorted({str(p.parent) for p in Path(a.root).rglob("outcomes.json")}, reverse=True)
        mods = report(list(AREAS) + ["other"], outs, area_of)
        text = f"{len(outs)} shard reports.\n\n" + markdown(mods)
        print(text)
        if a.markdown:
            Path(a.markdown).write_text(text)
    elif a.cmd == "record":
        mods = json.loads(Path(a.report).read_text())["modules"]
        old = json.loads(Path(a.baseline).read_text()) if Path(a.baseline).exists() else {}
        new = {k: v for k, v in old.items() if k != "modules"}
        new["modules"] = {m: {k: v[k] for k in ("tested", "caught", "timeout", "missed", "unviable", "kill_rate")} for m, v in mods.items()}
        Path(a.baseline).write_text(json.dumps(new, indent=2, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
