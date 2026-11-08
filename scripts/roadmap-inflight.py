import json
import pathlib
import sys

START = "<!-- inflight:start -->"
END = "<!-- inflight:end -->"
REPO = "https://github.com/lambdaclass/stabileo/pull"
PARKED_LABELS = {"status:needs-owner-ok"}


def state_of(pr):
    labels = {label["name"] for label in pr.get("labels", [])}
    if labels & PARKED_LABELS:
        return "parked"
    return "draft" if pr.get("isDraft") else "ready"


MARKDOWN = "\\`*_[]<>|#~"


def cell(text):
    text = " ".join(text.split())
    return "".join("\\" + c if c in MARKDOWN else c for c in text)


def table(prs):
    rows = [
        pr for pr in prs
        if pr.get("baseRefName", "main") == "main"
        and "dependabot" not in pr.get("author", {}).get("login", "")
    ]
    order = {"ready": 0, "draft": 1, "parked": 2}
    rows.sort(key=lambda pr: (order[state_of(pr)], -pr["number"]))
    if not rows:
        return "No pull requests are open."
    out = ["| PR | What | State |", "|---|---|---|"]
    for pr in rows:
        n = pr["number"]
        out.append(f"| [#{n}]({REPO}/{n}) | {cell(pr['title'])} | {state_of(pr)} |")
    return "\n".join(out)


def rewrite(text, prs):
    if START not in text or END not in text:
        raise SystemExit(f"markers {START} and {END} not found")
    head, rest = text.split(START, 1)
    _, tail = rest.split(END, 1)
    return f"{head}{START}\n{table(prs)}\n{END}{tail}"


def main():
    path = pathlib.Path(sys.argv[1])
    limit = int(sys.argv[2])
    prs = json.load(sys.stdin)
    if len(prs) >= limit:
        raise SystemExit(f"{len(prs)} pull requests read, the limit of {limit}: raise it so none are left out")
    new = rewrite(path.read_text(), prs)
    if new != path.read_text():
        path.write_text(new)
        print(f"{path}: in-flight table updated ({len(prs)} open pull requests read)")
    else:
        print(f"{path}: in-flight table already current")


if __name__ == "__main__":
    main()
