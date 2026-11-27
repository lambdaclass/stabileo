import json
from pathlib import Path
import re
import shutil
import sys
import tomllib


def dependency_paths(table):
    for name, value in table.items():
        if name in ('dependencies', 'dev-dependencies', 'build-dependencies'):
            for spec in value.values():
                if isinstance(spec, dict) and 'path' in spec:
                    yield spec['path']
        elif isinstance(value, dict):
            yield from dependency_paths(value)


def stage_workspace(root, primary, stage):
    pending = [primary]
    packages = set()
    while pending:
        package = pending.pop()
        if package in packages:
            continue
        packages.add(package)
        data = tomllib.loads((package / 'Cargo.toml').read_text())
        pending.extend((package / path).resolve() for path in dependency_paths(data))

    for package in packages:
        (stage / package.relative_to(root)).mkdir(parents=True, exist_ok=True)
    for package in packages:
        target = stage / package.relative_to(root)
        for source in package.iterdir():
            link = target / source.name
            if source.name.startswith('.') or source.name in ('target', 'pkg') or link.exists():
                continue
            if source.name == 'Cargo.toml' and package == primary:
                continue
            link.symlink_to(source)

    manifest = (primary / 'Cargo.toml').read_text()
    sections = re.split(r'(?=^\[)', manifest, flags=re.MULTILINE)
    settings = tomllib.loads(manifest)
    members = [primary.relative_to(root).as_posix()]
    excluded = sorted(p.relative_to(root).as_posix() for p in packages if p != primary)
    edition = settings['package'].get('edition', '2015')
    resolver = settings.get('workspace', {}).get('resolver', {'2021': '2', '2024': '3'}.get(edition, '1'))
    workspace = f'[workspace]\nmembers = {json.dumps(members)}\nexclude = {json.dumps(excluded)}\nresolver = {json.dumps(resolver)}\n'
    profiles = ''.join(section for section in sections if section.startswith('[profile.'))
    (stage / 'Cargo.toml').write_text(workspace + profiles)
    staged_primary = stage / primary.relative_to(root)
    package_manifest = ''.join(section for section in sections if not section.startswith(('[workspace]', '[profile.')))
    workspace_path = '/'.join('..' for _ in primary.relative_to(root).parts)
    (staged_primary / 'Cargo.toml').write_text(package_manifest.replace(
        '[package]\n', f'[package]\nworkspace = "{workspace_path}"\n', 1))
    shutil.copyfile(primary / 'Cargo.lock', stage / 'Cargo.lock')
    print(staged_primary)


if __name__ == '__main__':
    stage_workspace(*(Path(arg).resolve() for arg in sys.argv[1:]))
