import re
from pathlib import Path

import yaml


def split_papers(root):
    legacy = root / "research/papers.yaml"
    if not legacy.exists():
        return
    destination = root / "research/papers"
    entries = yaml.safe_load(legacy.read_text())["papers"]
    existing = {}
    orders = []
    for path in sorted(destination.glob("*.yaml")):
        paper = yaml.safe_load(path.read_text())
        orders.append(paper.pop("order"))
        existing[path.stem] = paper
    pending = []
    seen = set()
    order = max(orders, default=-1) + 1
    for paper in entries:
        pid = paper["id"]
        if not isinstance(pid, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", pid):
            raise ValueError(f"invalid paper id: {pid!r}")
        if pid in seen:
            raise ValueError(f"duplicate paper id: {pid}")
        seen.add(pid)
        if pid in existing:
            if existing[pid] != paper:
                raise ValueError(f"conflicting paper {pid}: reconcile {legacy} and {destination / (pid + '.yaml')}")
            continue
        pending.append((destination / f"{pid}.yaml", {"order": order, **paper}))
        order += 1
    destination.mkdir(parents=True, exist_ok=True)
    for path, paper in pending:
        path.write_text(yaml.safe_dump(paper, sort_keys=False, allow_unicode=True, width=100))
    legacy.unlink()


if __name__ == "__main__":
    split_papers(Path(__file__).resolve().parents[1])
