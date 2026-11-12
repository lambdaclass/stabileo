import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tempfile


MIRROR = r'(?:https?://azure\.archive\.ubuntu\.com/ubuntu/?|mirror\+file:/etc/apt/apt-(?:security-)?mirrors\.txt)'


def packages(names):
    if not isinstance(names, list) or not names or any(not isinstance(name, str) or not re.fullmatch(r'[a-z0-9][a-z0-9+.-]*(?::[a-z0-9]+)?', name) for name in names):
        raise ValueError('Unrecognized Playwright apt package list')
    return sorted(set(names))


def package_plan(browsers, playwright_directory="web"):
    with tempfile.TemporaryDirectory(prefix='browser-plan-') as directory:
        shim = Path(directory) / 'apt-get'
        captured = Path(directory) / 'packages.json'
        shim.write_text(f'#!{sys.executable}\nimport json, sys\nfrom pathlib import Path\n'
                        'if sys.argv[1:4] != ["install", "-s", "--no-install-recommends"]: sys.exit(2)\n'
                        f'Path({str(captured)!r}).write_text(json.dumps(sys.argv[4:]))\n')
        shim.chmod(0o755)
        subprocess.run(['npx', '--no-install', 'playwright', 'install-deps', '--dry-run', *browsers],
                              cwd=playwright_directory, check=True, capture_output=True, text=True,
                              env={**os.environ, 'PATH': directory + os.pathsep + os.environ['PATH']})
        if not captured.exists():
            raise ValueError('Playwright did not invoke the expected apt simulation')
        return packages(json.loads(captured.read_text()))


def rewrite_sources(text, suffix):
    if suffix == '.list':
        return ''.join(re.sub(MIRROR, 'http://security.ubuntu.com/ubuntu' if re.search(r'\S+-security\b', line) else 'http://archive.ubuntu.com/ubuntu', line)
                       for line in text.splitlines(keepends=True))
    result = []
    for stanza in re.split(r'\n\s*\n', text.strip()):
        if not re.search(MIRROR, stanza):
            result.append(stanza)
            continue
        match = re.search(r'^Suites:\s*(.+)$', stanza, re.M)
        if not match:
            raise ValueError('Ubuntu source has no Suites field')
        suites = match[1].split()
        for security in (False, True):
            group = [suite for suite in suites if suite.endswith('-security') == security]
            if group:
                copy = stanza[:match.start(1)] + ' '.join(group) + stanza[match.end(1):]
                result.append(re.sub(MIRROR, 'http://security.ubuntu.com/ubuntu' if security else 'http://archive.ubuntu.com/ubuntu', copy))
    return '\n\n'.join(result) + '\n'


def install(names, debs, apt_root=Path('/etc/apt')):
    debs.mkdir(parents=True, exist_ok=True)
    command = ['sudo', 'apt-get', '-o', f'Dir::Cache::Archives={debs}/',
               '-o', 'APT::Keep-Downloaded-Packages=true', '-o', 'DPkg::Lock::Timeout=300']
    local = [str(path) for path in sorted(debs.glob('*.deb'))]
    if subprocess.run(command + ['install', '-y', '--no-install-recommends', '--no-download', *names, *local]).returncode == 0:
        return
    with tempfile.TemporaryDirectory(prefix='browser-apt-') as directory:
        scoped = Path(directory)
        parts = scoped / 'sources.list.d'
        parts.mkdir()
        source = apt_root / 'sources.list'
        (scoped / 'sources.list').write_text(source.read_text() if source.exists() else '')
        for source in (apt_root / 'sources.list.d').glob('*'):
            if source.suffix in ('.list', '.sources'):
                shutil.copyfile(source, parts / source.name)
        try:
            socket.getaddrinfo('azure.archive.ubuntu.com', 80)
        except socket.gaierror:
            print('Temporary failure resolving azure.archive.ubuntu.com; using Ubuntu archive and security mirrors', flush=True)
            for source in [scoped / 'sources.list', *parts.iterdir()]:
                source.write_text(rewrite_sources(source.read_text(), source.suffix))
        options = ['-o', f'Dir::Etc::sourcelist={scoped / "sources.list"}', '-o', f'Dir::Etc::sourceparts={parts}']
        subprocess.run(command + options + ['-o', 'APT::Update::Error-Mode=any', 'update'], check=True)
        subprocess.run(command + options + ['install', '-y', '--no-install-recommends', *names], check=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=('key', 'install'))
    parser.add_argument('--playwright-directory', default='web')
    parser.add_argument('browsers', nargs='+', choices=('chromium', 'firefox', 'webkit'))
    args = parser.parse_args()
    names = package_plan(args.browsers, args.playwright_directory)
    debs = Path.home() / '.cache/browser-debs'
    if args.mode == 'key':
        digest = hashlib.sha256('\n'.join(names).encode()).hexdigest()
        arch = subprocess.run(['dpkg', '--print-architecture'], check=True, capture_output=True, text=True).stdout.strip()
        key = f'browser-debs-v2-{os.environ.get("ImageOS", "unknown")}-{os.environ.get("ImageVersion", "unknown")}-{arch}-{digest}'
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            output.write(f'dir={debs}\nkey={key}\n')
    else:
        install(names, debs)


if __name__ == '__main__':
    main()
