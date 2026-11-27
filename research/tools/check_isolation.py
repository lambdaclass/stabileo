"""The product may import published research data, never research code."""
import pathlib
import re
import sys

DATA = re.compile(r"research/(?:papers\.json|[^/]+/[^/]+/(?:VALIDATION\.json|results/stabileo_results\.json|reference-results/[^/]+\.(?:csv|json)))$")
ENGINE_TEST_DATA = re.compile(r"research/[^/]+/[^/]+/reference-results/[^/]+\.json$")
QUOTED = re.compile(r'''["'`]([^"'`\n]+)["'`]''')
ENGINE_MANIFEST_PATH = re.compile(r'(concat!\s*\(\s*env!\s*\(\s*"CARGO_MANIFEST_DIR"\s*\)\s*,\s*")(/[^"\n]*)"')


def check(root):
    root = pathlib.Path(root).resolve()
    errors = []
    for tree in ("engine", "backend", "web/src"):
        for path in (root / tree).rglob("*"):
            if not path.is_file() or path.suffix not in {".rs", ".toml", ".ts", ".js", ".svelte", ".css"} or "target" in path.parts:
                continue
            source = path.read_text()
            if tree == "engine" and path.suffix == ".rs" and "CARGO_MANIFEST_DIR" in source:
                source = ENGINE_MANIFEST_PATH.sub(
                    lambda m: m[1] + str((root / "engine" / m[2][1:]).resolve()) + '"', source
                )
            for line, text in enumerate(source.splitlines(), 1):
                for raw in QUOTED.findall(text):
                    if re.fullmatch(r'\s*sourcePath="research/[^/]+/[^/]+"\s*', text):
                        continue
                    spec = raw.split("?", 1)[0]
                    if "research/" not in spec or "://" in spec:
                        continue
                    # Public URLs and web/components/research are not imports from research/.
                    if spec.startswith("."):
                        target = (path.parent / spec).resolve()
                    elif spec.startswith("research/"):
                        target = root / spec
                    elif spec.startswith(str(root / "research") + "/"):
                        target = pathlib.Path(spec).resolve()
                    else:
                        continue
                    if not target.is_relative_to(root / "research"):
                        continue
                    rel = target.relative_to(root).as_posix()
                    web_data = tree == "web/src" and DATA.fullmatch(rel)
                    engine_test_data = (
                        tree == "engine"
                        and path.is_relative_to(root / "engine/tests")
                        and path.suffix == ".rs"
                        and ENGINE_TEST_DATA.fullmatch(rel)
                    )
                    if "${" in rel or not (web_data or engine_test_data):
                        errors.append(f"{path.relative_to(root)}:{line}: forbidden research import: {raw}")
    cargo = (root / "Cargo.toml").read_text()
    if re.search(r'["\'][^"\']*research[^"\']*["\']', cargo):
        errors.append("research/ must not be referenced by the root Cargo workspace")
    for manifest in (root / "research").rglob("Cargo.toml"):
        if "target" not in manifest.parts and not re.search(r"^\[workspace\]", manifest.read_text(), re.M):
            errors.append(f"{manifest.relative_to(root)} must declare its own [workspace]")
    return errors


if __name__ == "__main__":
    errors = check(sys.argv[1])
    print("\n".join(errors) if errors else "research isolation: ok")
    sys.exit(bool(errors))
