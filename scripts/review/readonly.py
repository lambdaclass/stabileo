"""Run a reviewer with only its private scratch/config tree writable."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


SECRET_ENV = ('GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN', 'GH_CONFIG_DIR',
              'SSH_AUTH_SOCK', 'GIT_ASKPASS', 'SSH_ASKPASS', 'NETRC')


def hidden_credentials(home, environ=os.environ):
    config = Path(environ.get('XDG_CONFIG_HOME') or home / '.config')
    candidates = {home / '.config/gh', config / 'gh', home / '.ssh', home / '.gnupg', home / '.git-credentials', home / '.netrc'}
    for name in ('GH_CONFIG_DIR', 'NETRC'):
        if environ.get(name):
            candidates.add(Path(environ[name]))
    return sorted(path for path in candidates if path.exists())


HOST_SOCKETS = ('/tmp', '/var/tmp', '/run/user', '/run/docker.sock', '/run/containerd', '/run/podman')


def host_sockets(environ=os.environ):
    candidates = {Path(path) for path in HOST_SOCKETS}
    if environ.get('SSH_AUTH_SOCK'):
        candidates.add(Path(environ['SSH_AUTH_SOCK']))
    return sorted({path.resolve() for path in candidates if path.exists()})


def sandbox_command(paths, command, platform=sys.platform, hide=(), sockets=(), cwd=None):
    # These are writable exceptions, never repository or artifact paths.
    paths = sorted({str(Path(path).resolve()) for path in paths})
    if platform == 'darwin':
        rules = ' '.join(f'(subpath {json.dumps(path)})' for path in paths)
        hidden = ' '.join(f'({"subpath" if Path(path).is_dir() else "literal"} {json.dumps(str(path))})' for path in hide)
        unix = ' '.join(f'(remote unix-socket (path-literal {json.dumps(str(path))}))' for path in sockets if Path(path).is_socket())
        return ['sandbox-exec', '-p',
                f'(version 1)(allow default)(deny file-write*)'
                f'(allow file-write* {rules})' + (f'(deny file-read* {hidden})' if hidden else '')
                + (f'(deny network-outbound {unix})' if unix else ''), *command]
    masked = [str(path) for path in sockets if Path(path).is_dir()]
    exposed = [Path(cwd)] if cwd else []
    exposed += [Path(entry) for entry in os.environ.get('PATH', '').split(os.pathsep) if entry]
    visible = sorted({str(path.resolve()) for path in exposed
                      if path.is_dir() and any(path.resolve().is_relative_to(dir) for dir in masked)})
    return ['bwrap', '--die-with-parent', '--ro-bind', '/', '/', '--dev', '/dev',
            *[arg for path in masked for arg in ('--tmpfs', path)],
            *[arg for path in visible for arg in ('--ro-bind', path, path)],
            *[arg for path in paths for arg in ('--bind', path, path)],
            *[arg for path in map(str, sockets) if path not in masked for arg in ('--ro-bind', '/dev/null', path)],
            *[arg for path in map(str, hide) for arg in (('--tmpfs', path) if Path(path).is_dir() else ('--ro-bind', '/dev/null', path))],
            '--unshare-pid', '--unshare-ipc', '--proc', '/proc', '--', *command]


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
            shutil.copytree(source, config, ignore=shutil.ignore_patterns('gh'))
        else:
            config.mkdir()
        env = {k: v for k, v in os.environ.items() if k not in SECRET_ENV}
        env.update(HOME=str(home), XDG_CONFIG_HOME=str(config),
                   XDG_CACHE_HOME=str(scratch / 'cache'),
                   XDG_DATA_HOME=str(scratch / 'data'),
                   XDG_STATE_HOME=str(scratch / 'state'),
                   TMPDIR=str(scratch), TMP=str(scratch), TEMP=str(scratch))
        # stdout/stderr stay on the descriptors opened by the parent runner.
        return subprocess.call(sandbox_command([scratch], command, hide=hidden_credentials(original_home, os.environ),
                                               sockets=host_sockets(os.environ), cwd=os.getcwd()), env=env)


if __name__ == '__main__':
    sys.exit(main(sys.argv[sys.argv.index('--') + 1:]))
