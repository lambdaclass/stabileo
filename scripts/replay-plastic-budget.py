import argparse
import json
from pathlib import Path
import resource
import subprocess
import tempfile
import time


def replay(binary, artifact, mode="gate", repeats=5, seconds=60, memory_mib=512):
    def limits():
        size = memory_mib * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (size, size))
        resource.setrlimit(resource.RLIMIT_CPU, (int(seconds) + 1, int(seconds) + 1))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))

    start = time.monotonic()
    peak_rss = 0
    failure = None
    with tempfile.TemporaryFile(mode="w+") as output:
        with tempfile.TemporaryFile(mode="w+") as errors:
            child = subprocess.Popen([str(binary), str(artifact), mode, str(repeats)],
                                     stdout=output, stderr=errors, preexec_fn=limits)
            while child.poll() is None:
                try:
                    status = Path(f"/proc/{child.pid}/status").read_text()
                    for line in status.splitlines():
                        if line.startswith(("VmHWM:", "VmRSS:")):
                            peak_rss = max(peak_rss, int(line.split()[1]) * 1024)
                except FileNotFoundError:
                    pass
                if time.monotonic() - start > seconds:
                    failure = "timeout"
                    child.kill()
                    break
                time.sleep(0.005)
            code = child.wait()
            output.seek(0)
            rows = [json.loads(line) for line in output if line.strip()]
            errors.seek(0)
            error = errors.read()
    if failure is None:
        if code != 0:
            failure = "process failure"
        elif len(rows) != repeats:
            failure = "incomplete replay"
        elif any(row["live_after"] > row["live_before"] for row in rows[1:]):
            failure = "retained allocation"
    return {"artifact": str(artifact), "mode": mode, "seconds": time.monotonic() - start,
            "peak_rss_bytes": peak_rss, "failure": failure, "exit_code": code,
            "iterations": rows, "stderr": error}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("artifact", type=Path)
    parser.add_argument("--binary", type=Path, default=Path("engine/fuzz/target/release/examples/plastic_replay"))
    parser.add_argument("--mode", default="gate", choices=["gate", "engine", "hang", "leak"])
    parser.add_argument("--seconds", type=float, default=60)
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--memory-mib", type=int, default=512)
    args = parser.parse_args()
    result = replay(args.binary, args.artifact, args.mode, args.repeats, args.seconds, args.memory_mib)
    print(json.dumps(result, sort_keys=True))
    return int(result["failure"] is not None)


if __name__ == "__main__":
    raise SystemExit(main())
