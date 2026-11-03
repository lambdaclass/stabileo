"""Run selected Playwright globs without shell expansion or duration-shard overlap."""
import json
import os
from pathlib import Path
import subprocess

specs = json.loads(os.environ['E2E_SPECS'])
files = sorted({str(p) for pattern in specs for p in Path('e2e').glob(pattern)})
if not files:
    raise SystemExit('Selected E2E area has no specs; refusing a green empty run')
grep = r'(?=.*@smoke)(?=.*@engine)' if os.environ['CI_SCOPE'] == 'engine' else '@smoke'
subprocess.run(['npx', 'playwright', 'test', *files, '--grep', grep,
                '--grep-invert', '@flaky'], check=True)
