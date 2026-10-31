#!/usr/bin/env python3
"""Package all dumped failures before replaying and reducing within one budget."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--models', type=Path, required=True)
    p.add_argument('--check', required=True)
    p.add_argument('--seed', required=True)
    p.add_argument('--seconds', type=float, default=840)
    p.add_argument('--out', type=Path, default=Path('nightly-findings'))
    a = p.parse_args()
    deadline = time.monotonic() + a.seconds
    pending = []
    for model in sorted(a.models.glob('*.json')):
        data = json.loads(model.read_text())
        key = hashlib.sha256(model.name.encode()).hexdigest()
        out = a.out / key
        out.mkdir(parents=True, exist_ok=True)
        original = out / 'original.finding.json'
        original.write_text(json.dumps({
            'test': f'{a.check}/dumped_failure', 'seed': a.seed, 'model': data,
            'details': {'source': model.name, 'status': 'original failure; replay pending'},
            'reduction': 'not reduced (collection may have been interrupted)',
            'command': f'python3 scripts/nightly-models.py --model model.json --check {a.check} --seed {a.seed} --count 1',
        }, indent=2))
        pending.append((model, out, original))
    failed = bool(pending)
    for reduction in (0, 120):
        for model, out, original in pending:
            remaining = deadline - time.monotonic()
            if remaining < 1:
                return int(failed)
            try:
                proc = subprocess.run([
                    sys.executable, 'scripts/nightly-models.py', '--model', str(model.resolve()),
                    '--check', a.check, '--seed', a.seed, '--out', str(out),
                    '--seconds', str(max(1, int(remaining))), '--reduce-seconds', str(reduction),
                ], timeout=remaining)
                failed |= proc.returncode != 0
            except subprocess.TimeoutExpired:
                return 1
            if any(path != original for path in out.glob('*.finding.json')):
                original.unlink(missing_ok=True)
    return int(failed)


if __name__ == '__main__':
    sys.exit(main())
