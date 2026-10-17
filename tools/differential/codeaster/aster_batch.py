"""Run many generated command files in one Code_Aster session.

    python aster_batch.py JOBDIR [JOBDIR ...]

Each JOBDIR holds model.comm (from to_aster.py); the run writes
JOBDIR/result.json, or JOBDIR/error.txt when Code_Aster raises. Runs inside
the Code_Aster environment (container or conda env), from a scratch working
directory holding the element catalogue `elem.1` (run.sh arranges that).
Code_Aster start-up costs about a second, the models themselves tens of
milliseconds, hence the batching.
"""

import os
import sys
import traceback

from code_aster import CA

CA.init("--quiet")
import code_aster.Commands as _cmds  # noqa: E402

for job in sys.argv[1:]:
    out = os.path.join(job, "result.json")
    err = os.path.join(job, "error.txt")
    for p in (out, err):
        if os.path.exists(p):
            os.remove(p)
    ns = {"OUT_PATH": out, "__name__": "__aster_job__"}
    ns.update({k: getattr(_cmds, k) for k in dir(_cmds) if not k.startswith("_")})
    try:
        with open(os.path.join(job, "model.comm")) as fh:
            exec(compile(fh.read(), os.path.join(job, "model.comm"), "exec"), ns)
    except BaseException as ex:  # noqa: Code_Aster raises AsterError / SystemExit
        with open(err, "w") as fh:
            fh.write(f"{type(ex).__name__}: {ex}\n{traceback.format_exc()[-3000:]}")
    ns.clear()
