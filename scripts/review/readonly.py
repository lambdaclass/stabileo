import json
import os
from pathlib import Path
import sys


def sandbox_command(paths, command, platform=sys.platform):
    paths = sorted({str(Path(path).resolve()) for path in paths})
    if platform == 'darwin':
        rules = ' '.join(f'(subpath {json.dumps(path)})' for path in paths)
        return ['sandbox-exec', '-p',
                f'(version 1)(allow default)(deny file-write* {rules})', *command]
    return ['bwrap', '--die-with-parent', '--bind', '/', '/',
            *[arg for path in paths for arg in ('--ro-bind', path, path)],
            '--', *command]


if __name__ == '__main__':
    separator = sys.argv.index('--')
    command = sandbox_command(sys.argv[1:separator], sys.argv[separator + 1:])
    os.execvp(command[0], command)
