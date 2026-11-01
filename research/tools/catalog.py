"""Check research/papers.yaml.

  python3 -I research/tools/catalog.py check [--offline] [--links]
  python3 -I research/tools/catalog.py show <doi>
  python3 -I research/tools/catalog.py export

`export` writes papers.json (what the /research gallery reads); `check` fails if it is stale.

`check` validates the schema and the evidence behind each status; without --offline it fetches
every DOI from Crossref and fails unless title, authors, year and venue match exactly; --links
also fetches each GitHub code link (set GITHUB_TOKEN to avoid the anonymous rate limit) and fails unless its detected license matches the catalog.
`show` prints the Crossref block for a DOI, to paste into a new entry.
"""
import copy
import hashlib
import math
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG = os.environ.get("RESEARCH_CATALOG", os.path.join(ROOT, "papers.yaml"))
EXPORT = os.path.join(ROOT, "papers.json")
UA = "stabileo-research-catalog (https://github.com/lambdaclass/stabileo)"

AREAS = {
    "differentiable-fem", "fracture", "optimization", "metamaterials", "constitutive",
    "seismic", "digital-twins", "numerical-methods", "shells",
}
STATUSES = [
    "proposed", "reference-reproduced", "implementation-in-progress",
    "numerically-validated", "published-figures-compared", "interactive",
]
# Keep this explicit: catalog edits must not expand their own URL allowlist.
CODE_HOSTS = {"github.com", "gitlab.com", "zenodo.org", "doi.org"}
COMPLEXITY = {"low", "medium", "high"}
SUMMARY_SOURCES = {"crossref-abstract", "publisher-abstract", "repository-readme", "full-text"}
REQUIRED = [
    "id", "doi", "crossref", "area", "keywords", "summary", "summary_source", "code", "data", "methods",
    "dependencies", "complexity", "relevance", "status", "reproduced_published_results",
    "benchmarks", "implementation", "contacts",
]


def norm(s):
    return re.sub(r"\s+", " ", html.unescape(s or "")).strip()


def get_json(url):
    for attempt in range(4):
        try:
            headers = {"User-Agent": UA}
            token = os.environ.get("GITHUB_TOKEN")
            if token and url.startswith("https://api.github.com/"):
                headers["Authorization"] = f"Bearer {token}"
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if attempt == 3:
                raise
        except urllib.error.URLError:
            if attempt == 3:
                raise
        time.sleep(2 ** attempt)


def crossref_block(doi):
    msg = get_json("https://api.crossref.org/works/" + urllib.parse.quote(doi))
    if msg is None:
        return None
    m = msg["message"]
    authors = []
    for a in m.get("author", []):
        if "family" in a:
            authors.append(norm(f"{a.get('given', '')} {a['family']}"))
        else:
            authors.append(norm(a.get("name", "")))
    return {
        "title": norm((m.get("title") or [""])[0]),
        "authors": authors,
        "year": m["issued"]["date-parts"][0][0],
        "venue": norm((m.get("container-title") or [""])[0]),
    }


def valid_checks(checks, published=False):
    def finite_number(value):
        return type(value) in (int, float) and math.isfinite(value)

    return isinstance(checks, list) and bool(checks) and all(
        isinstance(c, dict) and c.get("passed") is True and
        isinstance(c.get("metric"), str) and bool(c["metric"].strip()) and
        finite_number(c.get("observed")) and finite_number(c.get("tolerance")) and
        0 <= c["observed"] <= c["tolerance"] and
        (not published or isinstance(c.get("source"), str) and bool(c["source"].strip()))
        for c in checks
    )


def valid_code_url(value):
    if not isinstance(value, str) or any(c.isspace() or ord(c) < 32 for c in value):
        return False
    try:
        url = urllib.parse.urlsplit(value)
        return (url.scheme == "https" and url.hostname in CODE_HOSTS
                and url.username is None and url.password is None
                and url.port in (None, 443) and "\\" not in value)
    except ValueError:
        return False


def check_entry(p, errors):
    pid = p.get("id", "?")
    for k in REQUIRED:
        if k not in p:
            errors.append(f"{pid}: missing field '{k}'")
    if p.get("area") not in AREAS:
        errors.append(f"{pid}: area '{p.get('area')}' not in {sorted(AREAS)}")
    if p.get("complexity") not in COMPLEXITY:
        errors.append(f"{pid}: complexity must be one of {sorted(COMPLEXITY)}")
    source = p.get("summary_source")
    if (p.get("summary") or "").strip():
        if source not in SUMMARY_SOURCES:
            errors.append(f"{pid}: a summary needs summary_source in {sorted(SUMMARY_SOURCES)}; "
                          "never from memory or the title (leave the summary empty instead)")
    elif source is not None:
        errors.append(f"{pid}: summary_source given but the summary is empty")
    status = p.get("status")
    if status not in STATUSES:
        errors.append(f"{pid}: status '{status}' not in {STATUSES}")
        return
    if type(p.get("reproduced_published_results")) is not bool:
        errors.append(f"{pid}: reproduced_published_results must be a boolean")
    rank = STATUSES.index(status)
    impl = p.get("implementation")
    if rank >= 1:
        if not impl:
            errors.append(f"{pid}: status '{status}' needs an implementation directory")
            return
        manifest = os.path.join(ROOT, impl, "reference-results", "MANIFEST.json")
        if not os.path.isfile(manifest):
            errors.append(f"{pid}: status '{status}' needs {os.path.relpath(manifest, ROOT)}")
        else:
            with open(manifest) as f:
                evidence = json.load(f)
            hashes = evidence.get("files_sha256")
            if not isinstance(hashes, dict) or not hashes:
                errors.append(f"{pid}: manifest needs nonempty files_sha256")
            else:
                for name, digest in hashes.items():
                    root = os.path.realpath(os.path.dirname(manifest))
                    target = os.path.realpath(os.path.join(root, name))
                    if (not target.startswith(root + os.sep) or
                            not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest) or
                            not os.path.isfile(target)):
                        errors.append(f"{pid}: invalid reference hash entry {name}")
                    else:
                        with open(target, "rb") as f:
                            if hashlib.sha256(f.read()).hexdigest() != digest:
                                errors.append(f"{pid}: reference hash mismatch for {name}")
    if rank >= 3:
        tests = os.path.join(ROOT, impl, "VALIDATION.json")
        if not os.path.isfile(tests):
            errors.append(f"{pid}: status '{status}' needs {os.path.relpath(tests, ROOT)}")
        else:
            with open(tests) as f:
                v = json.load(f)
            if not valid_checks(v.get("checks")):
                errors.append(f"{pid}: status '{status}' but VALIDATION.json has a failing or no check")
    if status == "published-figures-compared" or p.get("reproduced_published_results") is True:
        comparison = os.path.join(ROOT, impl or "", "PUBLISHED_COMPARISON.json")
        if p.get("reproduced_published_results") is not True:
            errors.append(f"{pid}: published comparison requires reproduced_published_results: true")
        if not os.path.isfile(comparison):
            errors.append(f"{pid}: published comparison needs PUBLISHED_COMPARISON.json")
        else:
            with open(comparison) as f:
                evidence = json.load(f)
            checks = evidence.get("checks", [])
            if not valid_checks(checks, published=True):
                errors.append(f"{pid}: published comparison needs passing checks with sources, metrics, observations and tolerances")
    if status == "interactive":
        page = p.get("page")
        if not page or not os.path.isfile(os.path.join(ROOT, "..", page)):
            errors.append(f"{pid}: interactive status needs an existing page")
    for c in p.get("code") or []:
        if not valid_code_url(c.get("url")):
            errors.append(f"{pid}: code URL must use HTTPS on an allowed host")
        if not {"url", "license", "commit"} <= set(c):
            errors.append(f"{pid}: code entry needs url, license and commit")
        if not re.fullmatch(r"[0-9a-f]{40}", c.get("commit", "")):
            errors.append(f"{pid}: code commit must be a full 40-character revision")
    for c in p.get("contacts") or []:
        if not c.get("source"):
            errors.append(f"{pid}: contact without a verifying source")


def check_crossref(p, errors):
    got = crossref_block(p["doi"])
    if got is None:
        errors.append(f"{p['id']}: DOI {p['doi']} not found in Crossref")
        return
    want = p.get("crossref") or {}
    for k in ("title", "authors", "year", "venue"):
        if want.get(k) != got[k]:
            errors.append(f"{p['id']}: crossref.{k} is {want.get(k)!r}, Crossref says {got[k]!r}")


def check_links(p, errors):
    for c in p.get("code") or []:
        m = re.match(r"https://github\.com/([^/]+)/([^/#?]+)/?$", c["url"])
        if not m:
            errors.append(f"{p['id']}: only GitHub repository links are checked; got {c['url']}")
            continue
        commit = c.get("commit", "")
        if not re.fullmatch(r"[0-9a-f]{40}", commit):
            errors.append(f"{p['id']}: licence check requires a pinned commit")
            continue
        repo = get_json(f"https://api.github.com/repos/{m[1]}/{m[2]}/license?ref={commit}")
        if repo is None:
            errors.append(f"{p['id']}: {c['url']} has no detected licence at {commit}")
            continue
        spdx = (repo.get("license") or {}).get("spdx_id") or "none"
        if spdx == "NOASSERTION":
            spdx = "none"
        if spdx != c["license"]:
            errors.append(f"{p['id']}: {c['url']} license is {spdx}, catalog says {c['license']}")


def export_text(papers):
    papers = copy.deepcopy(papers)
    for paper in papers:
        paper["crossref"]["title"] = norm(re.sub(r"</?i>", "", paper["crossref"]["title"]))
    return json.dumps({"generated_from": "research/papers.yaml", "papers": papers}, indent=1, ensure_ascii=False) + "\n"


def main(argv):
    if len(argv) >= 2 and argv[0] == "show":
        print(yaml.safe_dump({"crossref": crossref_block(argv[1])}, sort_keys=False, allow_unicode=True))
        return 0
    if argv and argv[0] == "export":
        with open(CATALOG) as f:
            papers = yaml.safe_load(f)["papers"]
        with open(EXPORT, "w") as f:
            f.write(export_text(papers))
        return 0
    if not argv or argv[0] != "check":
        print(__doc__)
        return 2
    with open(CATALOG) as f:
        papers = yaml.safe_load(f)["papers"]
    errors = []
    ids = [p.get("id") for p in papers]
    if len(set(ids)) != len(ids):
        errors.append("duplicate ids")
    for p in papers:
        check_entry(p, errors)
        if "--offline" not in argv:
            check_crossref(p, errors)
        if "--links" in argv:
            check_links(p, errors)
    if "RESEARCH_CATALOG" not in os.environ:
        current = open(EXPORT).read() if os.path.exists(EXPORT) else ""
        if current != export_text(papers):
            errors.append("papers.json is stale: run `catalog.py export`")
    for e in errors:
        print("FAIL", e)
    print(f"{len(papers)} papers, {len(errors)} problems")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
