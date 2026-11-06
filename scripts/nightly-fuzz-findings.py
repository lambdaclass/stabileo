#!/usr/bin/env python3
"""Reduce libFuzzer crashes and package JSON findings, retaining raw artifacts."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

out = Path('nightly-findings')
target = os.environ['FUZZ_TARGET']
seed = int(os.environ['FUZZ_SEED'])
triple = os.environ['FUZZ_TARGET_TRIPLE']
FUZZ_LIMITS = ['-rss_limit_mb=2048', '-timeout=60']


def fails_alone(source):
    try:
        run = subprocess.run(['cargo', '+nightly-2026-10-15', 'fuzz', 'run', '--target', triple, target, str(source.resolve()), '--', *FUZZ_LIMITS],
                             cwd='engine', timeout=300)
    except subprocess.TimeoutExpired:
        return True
    return run.returncode != 0


for source in sorted(Path(f'engine/fuzz/artifacts/{target}').glob('*')):
    if not source.is_file() or source.name.startswith('slow-unit-'):
        continue
    if source.name.startswith('oom-') and not fails_alone(source):
        reduction = (f'not reduced: within {" ".join(FUZZ_LIMITS)} when run alone, so the memory grew across the '
                     'fuzzing run (a leak or retained allocation) or with this input in that state; replay it '
                     'repeatedly in one process to tell which')
    else:
        # tmin retains the same fuzz-target failure; bound its wall time too.
        reduction = 'libFuzzer tmin (bounded to 120 seconds)'
        minimized = (out / (source.name + '.min')).resolve()
        try:
            subprocess.run(['cargo', '+nightly-2026-10-15', 'fuzz', 'tmin', '--target', triple, target,
                            str(source.resolve()), '--', '-max_total_time=90', f'-exact_artifact_path={minimized}'], cwd='engine', timeout=120, check=True)
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError):
            reduction = 'budget-limited; original crashing input retained'
        # Use libFuzzer's explicitly named minimized artifact when present.
        if minimized.exists():
            source = minimized
        else:
            reduction = 'original crashing input; minimizer produced no smaller artifact'
    model = {'raw_hex': source.read_bytes().hex()}
    command = ("python3 -c 'import json; from pathlib import Path; Path(\"crash.bin\").write_bytes(bytes.fromhex(json.load(open(\"model.json\"))[\"raw_hex\"]))'\n"
               + f'cd engine && cargo +nightly-2026-10-15 fuzz run --target x86_64-unknown-linux-gnu {target} ../crash.bin')
    key = hashlib.sha256(source.read_bytes()).hexdigest()
    (out / f'{key}.finding.json').write_text(json.dumps(dict(
        test=f'fuzz/{target}', seed=seed, model=model, reduction=reduction,
        details=source.name,
        command=command
    ), indent=2))
