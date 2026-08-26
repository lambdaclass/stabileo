/**
 * Every element on screen gets reached, whichever way it is drawn.
 *
 * # The defect
 *
 * `ctx.elementGroups` is a PARTIAL registry, by design: in wireframe render
 * mode a plain member is a segment of one batched `LineSegments2` and is given
 * no group of its own. Only members needing extra geometry — a section
 * extrusion, a hinge glyph — get one.
 *
 * Four flat colour maps and the verification labels iterated that map. In
 * wireframe, which is what Basic 3D opens in, they therefore reached almost
 * nothing: axial-as-member-colour left a 633-member industrial shed entirely
 * white. Nothing threw; the loop simply had nothing to loop over.
 *
 * The lesson generalises past this bug: a map that is *usually* complete is the
 * worst kind of data structure to iterate, because it works in every case
 * anyone tries by hand.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { forEachElementVisual } from '../results-sync';

/** Just enough context: the two registries the helper walks. */
function ctxWith(batchedIds: number[], groupIds: number[]) {
  const elementGroups = new Map<number, unknown>();
  for (const id of groupIds) elementGroups.set(id, { id, isGroup: true });
  return {
    elementsBatched: { ids: () => batchedIds },
    elementGroups,
  } as never;
}

const visit = (ctx: never) => {
  const seen: Array<{ id: number; hasGroup: boolean }> = [];
  forEachElementVisual(ctx, (id, group) => seen.push({ id, hasGroup: !!group }));
  return seen;
};

describe('wireframe: many members, few groups', () => {
  it('reaches every member even when none has a group', () => {
    // The reported case, in miniature: all members batched, no groups at all.
    const seen = visit(ctxWith([1, 2, 3, 4, 5], []));
    expect(seen.map((s) => s.id)).toEqual([1, 2, 3, 4, 5]);
    expect(seen.every((s) => !s.hasGroup)).toBe(true);
  });

  it('hands the group over for the few members that have one', () => {
    const seen = visit(ctxWith([1, 2, 3], [2]));
    expect(seen.find((s) => s.id === 2)!.hasGroup).toBe(true);
    expect(seen.find((s) => s.id === 1)!.hasGroup).toBe(false);
  });

  it('visits each member exactly once', () => {
    const seen = visit(ctxWith([1, 2, 3], [1, 2, 3]));
    expect(seen).toHaveLength(3);
    expect(new Set(seen.map((s) => s.id)).size).toBe(3);
  });
});

describe('solid mode: every member has a group', () => {
  it('reaches them all, with their groups', () => {
    const seen = visit(ctxWith([7, 8], [7, 8]));
    expect(seen.map((s) => s.id).sort()).toEqual([7, 8]);
    expect(seen.every((s) => s.hasGroup)).toBe(true);
  });
});

describe('the registries disagreeing', () => {
  it('still reaches a group with no batched segment', () => {
    // Should not happen, but if it does the member is on screen and still has
    // to be coloured — dropping it would be the same class of bug again.
    const seen = visit(ctxWith([1], [1, 99]));
    expect(seen.map((s) => s.id).sort((a, b) => a - b)).toEqual([1, 99]);
    expect(seen.find((s) => s.id === 99)!.hasGroup).toBe(true);
  });

  it('handles an empty model without throwing', () => {
    expect(visit(ctxWith([], []))).toEqual([]);
  });
});

/**
 * The rule, enforced on the code rather than trusted to memory.
 *
 * The helper above has been correct since the day it was written, and the bug
 * came back anyway — twice. Not because anyone changed it, but because the
 * next piece of code that needed to colour every member iterated the partial
 * map instead of calling it, and iterating a map that is *usually* complete
 * works in every case anyone checks by hand.
 *
 * The third occurrence was `syncSelection`: selecting a member in Basic 3D
 * highlighted nothing at all, on every model, because in wireframe there were
 * no groups to iterate. The colour maps had been fixed; this had not.
 *
 * So the guard is on the pattern: a loop over `elementGroups` may not push a
 * colour into the batched mesh, because the members it misses are exactly the
 * ones whose only colour lives there.
 *
 * It reads source text, with the limits that implies — a loop written some
 * other way slips past. It catches the shape that has actually recurred three
 * times, which is what a guard is for.
 */
describe('nothing colours members by walking the partial registry', () => {
  const FILES = [
    'src/lib/viewport3d/scene-sync.ts',
    'src/lib/viewport3d/results-sync.ts',
    'src/components/Viewport3D.svelte',
  ];

  /** The body of a brace-balanced block starting at `open`. */
  function blockAt(src: string, open: number): string {
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) return src.slice(open, i + 1);
      }
    }
    return src.slice(open);
  }

  it('no loop over elementGroups writes a batched colour', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const src = readFileSync(file, 'utf8');
      const re = /for \(const \[[^\]]*\] of (?:ctx\.)?elementGroups\)\s*\{/g;
      for (const m of src.matchAll(re)) {
        const body = blockAt(src, m.index! + m[0].length - 1);
        if (/\.setBaseColor\(|elementsBatched\.setColor\(/.test(body)) {
          const line = src.slice(0, m.index).split('\n').length;
          offenders.push(`${file}:${line}`);
        }
      }
    }
    expect(offenders, `use forEachElementVisual instead:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the guard can see the files it claims to check', () => {
    // A renamed file would make the loop above pass over nothing at all,
    // which is the failure mode of every source-reading test.
    for (const file of FILES) {
      expect(readFileSync(file, 'utf8').length, file).toBeGreaterThan(1000);
    }
  });

  it('and the helper is genuinely used by the selection sync', () => {
    const src = readFileSync('src/lib/viewport3d/scene-sync.ts', 'utf8');
    const fn = src.slice(src.indexOf('export function syncSelection'));
    expect(fn.slice(0, fn.indexOf('\n}\n'))).toContain('forEachElementVisual');
  });
});
