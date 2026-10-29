#!/usr/bin/env bash
# Check source imports without consulting Git (including newly created files).
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
python3 -I "$root/research/tools/check_isolation.py" "$root"
