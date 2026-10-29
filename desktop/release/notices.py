import json
import pathlib
import sys
import urllib.request
import urllib.error

metadata = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
out = pathlib.Path('desktop/src-tauri/legal')
lines = ['Rust dependency notices', '']
cache = pathlib.Path('desktop/release/licenses')
cache.mkdir(exist_ok=True)

def upstream_licenses(package, root):
    vcs = root / '.cargo_vcs_info.json'
    revision = json.loads(vcs.read_text(encoding="utf-8"))['git']['sha1'] if vcs.exists() else None
    repo = (package['repository'] or '').removesuffix('.git').rstrip('/')
    if package['name'] == 'libappindicator-sys':
        repo = 'https://github.com/tauri-apps/libappindicator-rs'
    if not revision:
        for other in metadata['packages']:
            other_vcs = pathlib.Path(other['manifest_path']).parent / '.cargo_vcs_info.json'
            if other['repository'] == package['repository'] and other_vcs.exists():
                revision = json.loads(other_vcs.read_text(encoding="utf-8"))['git']['sha1']
                break
    if not revision and package['name'] == 'cesu8':
        revision = 'v1.1.0'
    if not revision or not repo.startswith('https://github.com/'):
        raise SystemExit(f"Cannot locate immutable licence source for {package['name']}")
    key = repo.rsplit('/', 1)[1] + '-' + revision
    cached = cache / (key + '.txt')
    if not cached.exists():
        slug = repo.removeprefix('https://github.com/')
        texts = []
        for name in ['LICENSE', 'LICENSE.md', 'LICENSE-MIT', 'LICENSE-APACHE', 'COPYING', 'LICENSE.txt', 'LICENSE-MIT.txt', 'LICENSE-APACHE.txt', 'COPYRIGHT-RUST.txt', 'COPYING.MIT', 'COPYING.APACHE2', 'LICENSE-MIT.md', 'LICENSE-APACHE.md', 'AUTHORS']:
            url = f"https://raw.githubusercontent.com/{slug}/{revision}/{name}"
            try:
                text = urllib.request.urlopen(url).read().decode()
            except urllib.error.HTTPError as error:
                if error.code == 404:
                    continue
                raise
            texts += [url, text]
        if not texts:
            raise SystemExit(f"No root licence for {package['name']} at {revision}")
        cached.write_text('\n\n'.join(texts), encoding='utf-8')
    return cached.read_text(encoding="utf-8")

for package in sorted(metadata['packages'], key=lambda p: (p['name'], p['version'])):
    if package['source'] is None:
        continue
    root = pathlib.Path(package['manifest_path']).parent
    lines += [f"{package['name']} {package['version']}", f"Licence: {package['license']}", f"Source: {package['repository'] or package['source']}"]
    licenses = sorted(p for p in root.rglob('*') if p.is_file() and p.name.lower().startswith(('license', 'licence', 'copying', 'copyright', 'notice')))
    if package.get('license_file'):
        licenses.append(root / package['license_file'])
    if not licenses:
        lines.append(upstream_licenses(package, root))
    for path in dict.fromkeys(licenses):
        lines += [str(path.relative_to(root)), path.read_text(encoding='utf-8')]
    lines.append('')
(out / 'RUST-NOTICES.txt').write_text('\n'.join(lines), encoding='utf-8')
(out / 'SOURCE.txt').write_text(f'Stabileo — AGPL-3.0-only; see LICENSE.\nCorresponding source: https://github.com/lambdaclass/stabileo/tree/{sys.argv[2]}\nBuild instructions: docs/desktop/README.md in that source tree.\n', encoding='utf-8')
