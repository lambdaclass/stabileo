import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export function shardRanges(source, parts) {
  if (!Number.isInteger(parts) || parts < 1) throw new Error(`parts must be a positive integer, got ${parts}`);
  const file = ts.createSourceFile('shard.ts', source, ts.ScriptTarget.Latest, true);
  const lineOf = (pos) => file.getLineAndCharacterOfPosition(pos).line + 1;
  const lastLine = lineOf(source.length);
  const statements = file.statements.map((s) => ({ start: lineOf(s.getStart(file)), end: lineOf(s.getEnd()) }));
  const cuts = [];
  for (let i = 1; i < statements.length; i++) {
    if (statements[i - 1].end < statements[i].start) cuts.push(statements[i].start);
  }
  const chosen = [];
  for (let k = 1; k < parts; k++) {
    const target = 1 + (k * lastLine) / parts;
    const after = cuts.filter((c) => c > (chosen.at(-1) ?? 1));
    const best = after
      .slice(0, after.length - (parts - 1 - k))
      .reduce((a, c) => (a === undefined || Math.abs(c - target) < Math.abs(a - target) ? c : a), undefined);
    if (best === undefined) throw new Error(`cannot split ${lastLine} lines into ${parts} parts at top-level statements`);
    chosen.push(best);
  }
  const starts = [1, ...chosen];
  return starts.map((start, i) => ({ start, end: i + 1 < starts.length ? starts[i + 1] - 1 : lastLine }));
}

export function shardPattern(path, source, part, parts) {
  if (!Number.isInteger(part) || part < 1 || part > parts) throw new Error(`part must be in 1..${parts}, got ${part}`);
  const { start, end } = shardRanges(source, parts)[part - 1];
  return `${path}:${start}-${end}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [path, split] = process.argv.slice(2);
  const [part, parts] = (split ?? '').split('/').map(Number);
  console.log(shardPattern(path, readFileSync(path, 'utf8'), part, parts));
}
