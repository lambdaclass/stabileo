import json
import re
import sys


def version(value):
    match = re.fullmatch(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?", value)
    if not match:
        raise ValueError(f"Invalid version: {value}")
    major, minor, patch, pre = match.groups()
    identifiers = pre.split(".") if pre else []
    if any(not part or (part.isdigit() and len(part) > 1 and part.startswith("0")) for part in identifiers):
        raise ValueError(f"Invalid prerelease: {value}")
    return (int(major), int(minor), int(patch), not bool(pre),
            tuple((0, int(part)) if part.isdigit() else (1, part) for part in identifiers))


def check(current, proposed):
    if version(proposed) <= version(current):
        raise ValueError(f"Feed must advance: {current} -> {proposed}")


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as current, open(sys.argv[2], encoding="utf-8") as proposed:
        check(json.load(current)["version"], json.load(proposed)["version"])
