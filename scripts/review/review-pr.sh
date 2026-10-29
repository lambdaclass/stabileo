#!/usr/bin/env bash
set -euo pipefail
REVIEW_SCRIPTS=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=scripts/review/lib.sh
source "$REVIEW_SCRIPTS/lib.sh"
review_run both "$@"
