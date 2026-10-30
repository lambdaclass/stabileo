"""Run a reviewer with only its private scratch/config tree writable."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


def sandbox_command(paths, command, platform=sys.platform):
    # These are writable exceptions, never repository or artifact paths.
    paths = sorted({str(Path(path).resolve()) for path in paths})
    if platform == 'darwin':
        rules = ' '.join(f'(subpath {json.dumps(path)})' for path in paths)
        return ['sandbox-exec', '-p',
                f'(version 1)(allow default)(deny file-write*)'
                f'(allow file-write* {rules})', *command]
    return ['bwrap', '--die-with-parent', '--ro-bind', '/', '/',
            *[arg for path in paths for arg in ('--bind', path, path)],
            '--unshare-pid', '--proc', '/proc', '--', *command]


def main(command):
    with tempfile.TemporaryDirectory(prefix='stabileo-review-scratch-') as tmp:
        scratch = Path(tmp).resolve()
        home = scratch / 'home'
        home.mkdir()
        # Preserve authentication/settings without granting write access to shared
        # config. Dereference links so config writes cannot escape the sandbox.
        original_home = Path.home()
        for name in ('.kimi', '.kimi-code', '.grok'):
            source = original_home / name
            if source.is_dir():
                shutil.copytree(source, home / name)
        config = home / '.config'
        source = Path(os.environ.get('XDG_CONFIG_HOME', original_home / '.config'))
        if source.is_dir():
            shutil.copytree(source, config)
        else:
            config.mkdir()
        env = dict(os.environ, HOME=str(home), XDG_CONFIG_HOME=str(config),
                   XDG_CACHE_HOME=str(scratch / 'cache'),
                   XDG_DATA_HOME=str(scratch / 'data'),
                   XDG_STATE_HOME=str(scratch / 'state'),
                   TMPDIR=str(scratch), TMP=str(scratch), TEMP=str(scratch))
        # stdout/stderr stay on the descriptors opened by the parent runner.
        return subprocess.call(sandbox_command([scratch], command), env=env)


if __name__ == '__main__':
    sys.exit(main(sys.argv[sys.argv.index('--') + 1:]))
