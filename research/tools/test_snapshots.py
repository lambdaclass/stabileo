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
assert rows["bbbbbbb"], rows
print("snapshots.py: released and still-linked snapshots are never offered for pruning")

from unittest.mock import patch

for snapshot, version in zip(index['snapshots'], [2, 1, 1, 1]):
    snapshot['experimentVersions'] = {'shauer-2025': {'version': version, 'commit': None}}
rows = {s: why for s, _, why in snapshots.plan(index, {}, 0, 0, now=datetime(2028, 1, 1, tzinfo=timezone.utc))}
assert all(rows.values()), rows
assert rows['ddddddd'], rows

def history(*args):
    if args[0] == 'log':
        return 'head'
    if args[0] == 'ls-tree':
        return 'research/fracture/shauer-2025/versions.json'
    return '{"versions": [{"version": 1, "commit": "aaaaaaa111111"}, {"version": 2, "commit": "bbbbbbb222222"}]}'

with patch.object(snapshots, 'git', side_effect=history):
    assert set(snapshots.protected('main')) == {'aaaaaaa', 'bbbbbbb'}
print('all pinned commits and every indexed experiment version are protected')

replacement = {"snapshots": [
    {"short": short, "date": date, "research": [PAGE],
     "experimentVersions": {"shauer-2025": {"version": 1, "commit": None}}}
    for short, date in [("aaaaaaa", "2020-01-01T00:00:00+00:00"), ("bbbbbbb", "2021-01-01T00:00:00+00:00")]
]}
for entries in [replacement["snapshots"][:1], replacement["snapshots"]]:
    assert all(why for _, _, why in snapshots.plan(
        {"snapshots": entries}, {}, 0, 0, now=datetime(2028, 1, 1, tzinfo=timezone.utc)))
uncited = {"snapshots": [{"short": "eeeeeee", "date": "2020-01-01T00:00:00+00:00", "research": []}]}
assert snapshots.plan(uncited, {}, 0, 0)[0][2] == []
