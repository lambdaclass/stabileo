"""Write reference-results/MANIFEST.json: how the files were produced and their SHA-256.

  python -I manifest.py <reference-results dir> <reference repo dir> <runs.json>

runs.json maps each example name to {"script": ..., "steps": n, "wall_seconds": s}.
"""
import hashlib, json, os, platform, subprocess, sys
from datetime import datetime, timezone
import numpy, scipy, matplotlib

out, repo, runs = sys.argv[1], sys.argv[2], json.load(open(sys.argv[3]))
commit = subprocess.run(["git", "-C", repo, "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
files = {}
for name in sorted(os.listdir(out)):
    if name == "MANIFEST.json":
        continue
    with open(os.path.join(out, name), "rb") as f:
        files[name] = hashlib.sha256(f.read()).hexdigest()
manifest = {
    "produced_by": "phasefield-jr-py examples run unmodified through research/fracture/shauer-2025/reference/run_reference.py, which only records values the scripts compute; exported with reference/export.py",
    "reference_code": {"url": "https://github.com/nathanshauer/phasefield-jr-py", "commit": commit, "license": "MIT"},
    "runs": runs,
    "environment": {
        "python": platform.python_version(), "numpy": numpy.__version__, "scipy": scipy.__version__,
        "matplotlib": matplotlib.__version__, "platform": platform.platform(), "machine": platform.machine(),
        "install": "uv venv --python 3.12; uv pip install numpy==2.1.3 scipy==1.14.1 matplotlib==3.9.2",
    },
    "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    "files_sha256": files,
}
with open(os.path.join(out, "MANIFEST.json"), "w") as f:
    json.dump(manifest, f, indent=1)
    f.write("\n")
