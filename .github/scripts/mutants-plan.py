"""Tonight's mutants shards: the ones that went longest without running to their verdict.

Prints a JSON list of SLOTS shard indices out of TOTAL. A shard's age comes from the newest
mutants-done-<k>-of-<TOTAL> marker of a nightly.yml run on main; shards with no marker go first.
Ties keep the day-based rotation order, so a fresh start is the old rotation. If GitHub cannot be
read, it falls back to that rotation and says so.
"""
import json
import os
import re
import subprocess
import sys
import time

MARKER = re.compile(r"mutants-done-(\d+)-of-(\d+)")


def rotation(total, slots, day):
    return [(day * slots + i) % total for i in range(slots)]


def pick(total, slots, day, last_done):
    start = (day * slots) % total
    order = sorted(range(total), key=lambda k: (last_done.get(k, ""), (k - start) % total))
    return order[:slots]


def gh(path):
    out = subprocess.run(["gh", "api", "--paginate", "--slurp", path], capture_output=True, text=True, timeout=120, check=True)
    return json.loads(out.stdout)


def markers(repo, total, days):
    since = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - days * 86400))
    runs = [r for page in gh(f"repos/{repo}/actions/workflows/nightly.yml/runs?branch=main&created=>{since}&per_page=100")
            for r in page["workflow_runs"]]
    last = {}
    for run in runs:
        for page in gh(f"repos/{repo}/actions/runs/{run['id']}/artifacts?per_page=100"):
            for artifact in page["artifacts"]:
                m = MARKER.fullmatch(artifact["name"])
                if m and int(m.group(2)) == total and not artifact["expired"]:
                    k = int(m.group(1))
                    last[k] = max(last.get(k, ""), artifact["created_at"])
    return last


def main():
    total, slots, day = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
    try:
        last = markers(os.environ["GH_REPO"], total, int(os.environ.get("MUTANTS_LOOKBACK_DAYS", "45")))
    except Exception as ex:
        print(f"::warning title=Mutants rotation::markers unreadable ({ex}); tonight runs the day-based rotation", file=sys.stderr)
        print(json.dumps(rotation(total, slots, day)))
        return
    shards = pick(total, slots, day, last)
    never = sum(1 for k in range(total) if k not in last)
    oldest = min((last[k] for k in shards if k in last), default="none")
    print(f"mutants: {total - never} of {total} shards have a marker; tonight {slots}, {sum(1 for k in shards if k not in last)} without one, oldest marker among them {oldest}", file=sys.stderr)
    print(json.dumps(shards))


if __name__ == "__main__":
    main()
