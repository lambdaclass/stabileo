#!/usr/bin/env python3
"""engines.py: which model engine the runner may use right now (policy from Federico, 2026-10-31).

  engines.py status                       every engine's availability and why
  engines.py pick <write|review> [EXCLUDE...]  first available engine in policy order, or "none"

Policy:
- write (fixing research papers, Tools, docs): claude, codex, kimi, grok
- review: codex, kimi, grok (the caller excludes the author and the first reviewer, so the second
  review is always a different model)
- Claude is out when every cswap account shows its 5h or 7d window at 100 %.
- Codex is out when its weekly window is at 100 %: paid credits are never spent unless
  STABILEO_ALLOW_CODEX_CREDITS=1. Codex cannot write on this host (its bwrap sandbox is blocked by
  AppArmor; unsandboxed runs are not allowed), so it is skipped for write unless
  STABILEO_CODEX_CAN_WRITE=1.
- Kimi and Grok are probed with a one-line prompt; the result is cached for 30 minutes.
- STABILEO_FORCE_ENGINE=<name> overrides everything (dry runs and tests).
"""
import glob, json, os, re, subprocess, sys, time

ST = os.path.expanduser("~/projects/stabileo-state")
CACHE = os.path.join(ST, "state")
ORDER = {"write": ["claude", "codex", "kimi", "grok"], "review": ["codex", "kimi", "grok"]}


def claude_status():
    try:
        out = subprocess.run(["cswap", "list"], capture_output=True, text=True, timeout=60).stdout
    except Exception as e:
        return False, f"cswap list failed: {e}"
    accounts, cur = [], None
    for line in out.splitlines():
        if re.match(r"^\s+\d+:", line):
            cur = {"name": line.strip(), "5h": 0.0, "7d": 0.0}
            accounts.append(cur)
        m = re.search(r"(5h|7d):\s+(\d+(?:\.\d+)?)%", line)
        if m and cur is not None:
            cur[m.group(1)] = float(m.group(2))
    if not accounts:
        return False, "cswap list shows no accounts"
    usable = [a for a in accounts if a["5h"] < 100 and a["7d"] < 100]
    return bool(usable), f"{len(usable)}/{len(accounts)} accounts below 100 % (5h and 7d)"


def codex_status(mode):
    if mode == "write" and os.environ.get("STABILEO_CODEX_CAN_WRITE") != "1":
        return False, "cannot write here (bwrap sandbox blocked; unsandboxed runs not allowed)"
    files = sorted(glob.glob(os.path.expanduser("~/.codex/sessions/*/*/*/*.jsonl")), key=os.path.getmtime)
    for f in reversed(files[-20:]):
        hits = re.findall(r'"rate_limits":(\{.*?"plan_type":[^}]*\})', open(f, errors="replace").read())
        if not hits:
            continue
        rl = json.loads(hits[-1])
        now = time.time()
        for key in ("primary", "secondary"):
            w = rl.get(key) or {}
            if w.get("used_percent", 0) >= 100 and w.get("resets_at", 0) > now:
                if os.environ.get("STABILEO_ALLOW_CODEX_CREDITS") == "1":
                    return True, f"{key} window at 100 % but credits allowed by the owner"
                hours = (w["resets_at"] - now) / 3600
                return False, f"{key} window ({w.get('window_minutes')} min) at 100 %, resets in {hours:.1f} h; credits not allowed"
        return True, "below 100 % in the last recorded session"
    return True, "no recorded rate limits"


def probed(name, cmd, ok_pattern):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"{name}.json")
    try:
        c = json.load(open(path))
        if time.time() - c["at"] < 1800:
            return c["ok"], c["why"] + " (cached)"
    except Exception:
        pass
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=180, stdin=subprocess.DEVNULL,
                           cwd=os.path.expanduser("~/projects/stabileo-wt/base"))
        text = r.stdout + r.stderr
        if re.search(r"429|usage limit|quota|rate limit", text, re.I):
            ok, why = False, "quota exhausted (429)"
        else:
            ok = bool(re.search(ok_pattern, r.stdout))
            why = "answered the probe" if ok else f"no answer to the probe (exit {r.returncode})"
    except Exception as e:
        ok, why = False, f"probe failed: {e}"
    json.dump({"at": time.time(), "ok": ok, "why": why}, open(path, "w"))
    return ok, why


def status(name, mode):
    forced = os.environ.get("STABILEO_FORCE_ENGINE")
    if forced:
        return (name == forced), f"forced to {forced}"
    if name == "claude":
        return claude_status()
    if name == "codex":
        return codex_status(mode)
    if name == "kimi":
        return probed("kimi", ["kimi", "-p", "Reply with the single word OK."], r"\bOK\b")
    if name == "grok":
        return probed("grok", ["grok", "-p", "Reply with the single word OK.", "--permission-mode", "plan"], r"\bOK\b")
    return False, "unknown engine"


def main():
    if len(sys.argv) >= 2 and sys.argv[1] == "status":
        for mode in ("write", "review"):
            for e in ORDER[mode]:
                ok, why = status(e, mode)
                print(f"{mode:6} {e:6} {'yes' if ok else 'no ':3} {why}")
        return
    if len(sys.argv) >= 3 and sys.argv[1] == "pick" and sys.argv[2] in ORDER:
        mode, exclude = sys.argv[2], set(sys.argv[3:])
        for e in ORDER[mode]:
            if e in exclude:
                continue
            if status(e, mode)[0]:
                print(e)
                return
        print("none")
        return
    sys.exit(__doc__)


if __name__ == "__main__":
    main()
