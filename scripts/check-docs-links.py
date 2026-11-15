import argparse
import pathlib
import re
import sys
import urllib.parse


def without_fenced_code(text):
    lines = []
    closer = None
    for line in text.splitlines(keepends=True):
        body = line.rstrip('\r\n')
        if closer is not None:
            if closer.fullmatch(body):
                closer = None
        else:
            opener = re.fullmatch(r' {0,3}(`{3,}|~{3,})(.*)', body)
            if opener is None or (opener[1][0] == '`' and '`' in opener[2]):
                lines.append(line)
                continue
            closer = re.compile(r' {0,3}' + re.escape(opener[1][0]) + '{' + str(len(opener[1])) + r',}[ \t]*')
        lines.append('\n' if line.endswith('\n') else '')
    return ''.join(lines)


def destinations(text):
    text = without_fenced_code(text)
    text = re.sub(r'`[^`\n]+`', '', text)
    pattern = r'!?\[[^\]\n]*\]\(\s*(<[^>]+>|(?:[^\s()]|\([^()]*\))+)'
    yield from (m[1].strip('<>') for m in re.finditer(pattern, text))
    yield from (m[1].strip('<>') for m in re.finditer(
        r'^\s{0,3}\[[^\]\n]+\]:\s*(<[^>]+>|\S+)', text, re.M))
    yield from (m[1] for m in re.finditer(r'(?:href|src)=["\']([^"\']+)["\']', text))


def anchors(text):
    text = without_fenced_code(text)
    non_code = re.sub(r'`[^`\n]+`', '', text)
    found = set(re.findall(r'(?:id|name)=["\']([^"\']+)["\']', non_code))
    counts = {}
    for match in re.finditer(r'^ {0,3}#{1,6}\s+(.+?)\s*#*$', text, re.M):
        heading = re.sub(r'<[^>]+>', '', match[1])
        heading = re.sub(r'!?\[([^]]+)\]\([^)]*\)', r'\1', heading)
        slug = re.sub(r'[^\w -]', '', heading.lower()).replace(' ', '-')
        count = counts.get(slug, 0)
        counts[slug] = count + 1
        found.add(slug + (f'-{count}' if count else ''))
    return found


def check(root):
    problems = []
    count = 0
    for directory in ('docs', 'testing'):
        for source in sorted((root / directory).rglob('*.md')):
            for target in destinations(source.read_text()):
                url = urllib.parse.urlsplit(target)
                if url.scheme or url.netloc:
                    continue
                count += 1
                path = urllib.parse.unquote(url.path)
                destination = source if not path else (root / path.lstrip('/') if path.startswith('/') else source.parent / path)
                if not destination.exists():
                    problems.append(f'{source.relative_to(root)}: missing {target}')
                elif url.fragment and destination.suffix == '.md':
                    if urllib.parse.unquote(url.fragment) not in anchors(destination.read_text()):
                        problems.append(f'{source.relative_to(root)}: missing heading {target}')
    return count, problems


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=pathlib.Path, default=pathlib.Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    count, problems = check(args.root)
    for problem in problems:
        print(problem, file=sys.stderr)
    print(f'Checked {count} local documentation links; {len(problems)} missing targets.')
    return int(bool(problems))


if __name__ == '__main__':
    sys.exit(main())
