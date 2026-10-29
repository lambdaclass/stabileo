"""Append review metadata without reformatting the rest of the YAML catalog."""
import importlib.util
import json
from pathlib import Path
import sys

import yaml

root, paper_id, reviewer, sha, verdict = sys.argv[1:]
root = Path(root)
spec = importlib.util.spec_from_file_location("catalog", root / "research/tools/catalog.py")
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)
path = root / "research/papers.yaml"
text = path.read_text()
data = yaml.safe_load(text)
matches = [p for p in data["papers"] if p["id"] == paper_id]
if len(matches) != 1:
    sys.exit(f"Expected exactly one paper with id {paper_id!r}")
paper = matches[0]
reviews = paper.setdefault("reviews", [])
if not isinstance(reviews, list):
    sys.exit("reviews must be a list")
reviews.append({"reviewer": reviewer, "sha": sha, "verdict": verdict})
errors = []
for entry in data["papers"]:
    catalog.check_entry(entry, errors)
if errors:
    sys.exit("\n".join(errors))
# Replace just the reviews value, or insert the field before the selected id.
node = yaml.compose(text)
papers_node = next(v for k, v in node.value if k.value == "papers")
paper_node = next(n for n in papers_node.value
                  if any(k.value == "id" and v.value == paper_id for k, v in n.value))
field = next(((k, v) for k, v in paper_node.value if k.value == "reviews"), None)
encoded = json.dumps(reviews, ensure_ascii=False)
if field is not None:
    key, value = field
    end = value.end_mark.index
    # Block collections consume the newline before the following field.
    suffix = "\n" + " " * value.end_mark.column
    if value.flow_style:
        suffix = ""
    text = text[:key.start_mark.index] + "reviews: " + encoded + suffix + text[end:]
else:
    pos = paper_node.start_mark.index
    text = text[:pos] + "reviews: " + encoded + "\n  " + text[pos:]
if yaml.safe_load(text) != data:
    sys.exit("Refusing to write: YAML round-trip mismatch")
export = catalog.export_text(data["papers"])
path.write_text(text)
(root / "research/papers.json").write_text(export)
print(f"Recorded {reviewer} review of {paper_id} at {sha}")
