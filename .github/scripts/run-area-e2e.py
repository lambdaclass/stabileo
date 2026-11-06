"""Run selected Playwright globs without shell expansion or duration-shard overlap."""
import json
import os
from pathlib import Path
import subprocess

slow = os.environ.get('E2E_SUITE') == 'slow'
try:
    specs = json.loads(os.environ['E2E_SPECS'])
    if not isinstance(specs, list) or not specs or not all(isinstance(s, str) and s for s in specs):
        raise ValueError('empty or invalid E2E_SPECS')
except (KeyError, ValueError, TypeError):
    if not slow:
        raise
    specs = ['*.spec.ts']
files = sorted({str(p) for pattern in specs for p in Path('e2e').glob(pattern)})
if not files and slow:
    files = sorted(str(p) for p in Path('e2e').glob('*.spec.ts'))
if not files:
    raise SystemExit('Selected E2E area has no specs; refusing a green empty run')
grep = '@slow' if slow else (r'(?=.*@smoke)(?=.*@engine)' if os.environ.get('CI_SCOPE') == 'engine' else '@smoke')
invert = 'visual baselines|@flaky' if slow else '@flaky'
subprocess.run(['npx', 'playwright', 'test', *files, '--grep', grep,
                '--grep-invert', invert], check=True)
