import hashlib
import json
import pathlib
import sys


def check(root):
    root = pathlib.Path(root)
    public = root / 'web/public'
    configs = json.loads((root / 'web/src/components/research/preview-config.json').read_text())
    manifest_path = public / 'research/previews.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    errors = []
    for config in configs:
        entry = manifest.get(config['paperId'], {})
        replay = public / config['replay']
        digest = hashlib.sha256(replay.read_bytes()).hexdigest() if replay.exists() else None
        if not digest or entry.get('sha256') != digest or entry.get('replay') != config['replay']:
            errors.append(f"{config['paperId']}: missing/stale previews; build the site, then run cd web && nix develop .. -c npm run research:previews")
        for file in ['preview.png', 'thumb.png', 'preview.webm', 'preview.mp4']:
            path = public / config['path'].lstrip('/') / file
            if not path.is_file() or path.stat().st_size == 0:
                errors.append(f"{config['paperId']}: missing {file}; run research:previews")
    return errors


if __name__ == '__main__':
    errors = check(pathlib.Path(__file__).resolve().parents[2])
    print('\n'.join(errors) if errors else 'research previews: ok')
    sys.exit(bool(errors))
