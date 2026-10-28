#!/usr/bin/env python3
"""snapshots.py never offers a released or still-cited snapshot for pruning."""

import importlib.util
from datetime import datetime, timezone
from pathlib import Path

spec = importlib.util.spec_from_file_location("snapshots", Path(__file__).with_name("snapshots.py"))
snapshots = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshots)

PAGE = "/research/fracture/shauer-2025"
index = {"snapshots": [
    {"short": "ddddddd", "commit": "d", "date": "2026-10-01T00:00:00+00:00", "research": [PAGE]},
    {"short": "ccccccc", "commit": "c", "date": "2024-03-01T00:00:00-03:00", "research": ["/research/metamaterials/grossman-2026"]},
    {"short": "bbbbbbb", "commit": "b", "date": "2024-02-01T00:00:00+00:00", "research": [PAGE]},
    {"short": "aaaaaaa", "commit": "a", "date": "2024-01-01T00:00:00+00:00", "research": [PAGE]},
]}
keep = {"aaaaaaa": {"shauer-2025 v1"}}
rows = {s: why for s, _, why in snapshots.plan(index, keep, 365, 1, now=datetime(2026, 10, 28, tzinfo=timezone.utc))}
assert rows["aaaaaaa"] and "released" in rows["aaaaaaa"][0], rows  # a released version: never
assert rows["ccccccc"], rows  # the only snapshot holding grossman-2026: the gallery links to it
assert rows["ddddddd"], rows  # newest
assert rows["bbbbbbb"] == [], rows  # superseded, unreleased, old: the only candidate
print("snapshots.py: released and still-linked snapshots are never offered for pruning")
