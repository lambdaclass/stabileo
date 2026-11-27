import argparse
import json
import re
from pathlib import Path


def plain(markdown):
    return re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", markdown).replace("**", "")


def sentences(paragraph, count):
    return "".join(re.split(r"(?<=。)|(?<=\. )", paragraph)[:count]).rstrip()


def rows(section):
    return [
        [plain(cell.strip()) for cell in line.split("|")[1:-1]]
        for line in section.splitlines()
        if re.match(r"^\| (?:\[SA-|\d+ \|)", line)
    ]


def sync(root, locale):
    source = (root / "docs/releases" / f"v0.6.1.{locale}.md").read_text()
    article = root / "web/src/lib/blog/translations" / locale / "stabileo-0-6-1.ts"
    text = article.read_text()
    prefix, declaration, remainder = text.partition("const body: PostBody =")
    literal = remainder.lstrip()
    body, length = json.JSONDecoder().raw_decode(literal)
    sections = re.split(r"^## ", source, flags=re.MULTILINE)
    _, action, advisories, changes, other, limitations = sections
    blocks = body["blocks"]
    tables = [block for block in blocks if block["k"] == "table"]
    [advisory_table, changes_table] = tables
    [limitations_list] = [block for block in blocks if block["k"] == "ul"]
    paragraphs = [block for block in blocks if block["k"] == "p"]
    [introduction, _, other_changes] = paragraphs
    [note] = [block for block in blocks if block["k"] == "note"]
    body["title"] = source.splitlines()[0].removeprefix("# ")
    introduction["t"] = plain(action.split("\n\n")[1])
    body["excerpt"] = sentences(introduction["t"], 2)
    note["t"] = plain(advisories.split("\n\n")[1])
    advisory_table["rows"] = rows(advisories)
    changes_table["rows"] = rows(changes)
    other_changes["t"] = sentences(plain(other.split("\n\n")[1]), 3)
    limitations_list["items"] = [
        plain(line[2:]) for line in limitations.splitlines() if line.startswith("- ")
    ]
    whitespace = remainder.removesuffix(literal)
    encoded = json.dumps(body, ensure_ascii=False, indent=2)
    article.write_text(prefix + declaration + whitespace + encoded + literal[length:])


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("locale", choices=["de", "fr", "hu", "it", "nl", "tr", "zh"], nargs="+")
    for locale in parser.parse_args().locale:
        sync(Path(__file__).resolve().parents[1], locale)
