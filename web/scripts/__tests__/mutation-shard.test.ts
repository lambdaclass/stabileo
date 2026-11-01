import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { shardPattern, shardRanges } from '../mutation-shard.mjs';

const web = new URL('../../', import.meta.url);
const workflow = readFileSync(new URL('../.github/workflows/mutation-ts.yml', web), 'utf8');

function statementLines(source: string) {
  const file = ts.createSourceFile('x.ts', source, ts.ScriptTarget.Latest, true);
  const line = (pos: number) => file.getLineAndCharacterOfPosition(pos).line + 1;
  return file.statements.map((s) => ({ start: line(s.getStart(file)), end: line(s.getEnd()) }));
}

function expectPartition(source: string, parts: number) {
  const ranges = shardRanges(source, parts);
  expect(ranges).toHaveLength(parts);
  expect(ranges[0].start).toBe(1);
  expect(ranges.at(-1)!.end).toBe(source.split('\n').length);
  ranges.slice(1).forEach((r, i) => expect(r.start).toBe(ranges[i].end + 1));
  for (const s of statementLines(source)) {
    expect(ranges.filter((r) => r.start <= s.start && s.end <= r.end)).toHaveLength(1);
  }
  return ranges;
}

describe('shardRanges', () => {
  const source = [
    'export const A = 1;',
    '',
    'function f(x: number) {',
    '  if (x > 0) {',
    '    return x;',
    '  }',
    '  return -x;',
    '}',
    '',
    '/** doc */',
    'export function g() {',
    '  return f(2) + A;',
    '}',
    'const B = 2; const C = 3;',
    'export default B + C;',
    '',
  ].join('\n');

  it('splits only between top-level statements and covers every line once', () => {
    const ranges = expectPartition(source, 3);
    expect(ranges.map((r) => [r.start, r.end])).toEqual([[1, 2], [3, 10], [11, 16]]);
  });

  it('never separates two statements that share a line', () => {
    for (let parts = 1; parts <= 5; parts++) expectPartition(source, parts);
    expect(() => shardRanges(source, 6)).toThrow(/cannot split/);
  });

  it('leaves enough cuts for the later parts', () => {
    const lopsided = ['const a = 1;', 'const b = 2;', 'const c = 3;', ...Array(40).fill('// tail'), ''].join('\n');
    expect(expectPartition(lopsided, 3).map((r) => r.start)).toEqual([1, 2, 3]);
  });

  it('refuses a split it cannot make', () => {
    expect(() => shardRanges('const a = 1;\n', 2)).toThrow(/cannot split/);
    expect(() => shardRanges(source, 0)).toThrow(/positive integer/);
    expect(() => shardPattern('f.ts', source, 4, 3)).toThrow(/part must be/);
  });

  it('formats a Stryker mutate range', () => {
    expect(shardPattern('src/f.ts', source, 2, 3)).toBe('src/f.ts:3-10');
  });
});

describe('mutation-ts.yml split shards', () => {
  const entries = [...workflow.matchAll(/- shard: (\S+)\n\s+split: "(\d+)\/(\d+)"\n\s+mutate: >-\n\s+(\S+)/g)].map((m) => ({
    shard: m[1],
    part: Number(m[2]),
    parts: Number(m[3]),
    file: m[4],
  }));

  it('lists every part of each split file exactly once', () => {
    expect(entries.length).toBeGreaterThan(0);
    const byFile = new Map<string, number[]>();
    for (const e of entries) {
      expect(e.file).not.toContain(',');
      byFile.set(e.file, [...(byFile.get(e.file) ?? []), e.part]);
      expect(entries.filter((o) => o.file === e.file).every((o) => o.parts === e.parts)).toBe(true);
    }
    for (const [file, parts] of byFile) {
      const n = entries.find((e) => e.file === file)!.parts;
      expect(parts.sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
      expectPartition(readFileSync(new URL(file, web), 'utf8'), n);
    }
  });
});
