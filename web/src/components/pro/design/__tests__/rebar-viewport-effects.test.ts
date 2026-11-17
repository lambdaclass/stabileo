/**
 * The viewport's effects must SUBSCRIBE to the props they act on.
 *
 * ── The defect this guards, stated exactly ─────────────────────────
 *
 * `RebarViewport3D` carried this line:
 *
 *     $effect(() => {
 *       built?.setVisibility({ filter, concrete: showConcrete, conflicts: showConflicts });
 *     });
 *
 * `a?.b(c)` short-circuits the WHOLE call expression when `a` is nullish — the arguments are
 * never evaluated. `built` is nullish on that effect's first run, because the first geometry
 * build is deliberately deferred by two frames so the browser paints before the cage is
 * materialised. A Svelte effect subscribes to what it actually READ, so this one read nothing,
 * subscribed to nothing, and never ran again. Every layer switch in the rail — all six
 * families, reinforcement, concrete, conflicts — stopped reaching the scene, in silence: the
 * checkbox moved, the store changed, the derived filter recomputed, the tally beside the canvas
 * updated, and `mesh.visible` was never touched.
 *
 * ── Why a source-level guard and not a behavioural test ────────────
 *
 * Because the behavioural test is a browser test — `e2e/rebar-toggles.spec.ts` — and a browser
 * test tells you the switch is broken, not why, and only in the one place someone remembered to
 * click. The mistake is a SHAPE, it is invisible on review, and it is one character wide. This
 * file forbids the shape.
 *
 * The rule: inside an `$effect`, every reactive input the body mentions must be read before the
 * first optional-chained call in that body. Reading into a local — `const next = { filter }` —
 * satisfies it, and so does a bare `void filter`, which is what the effects that were never
 * broken already did.
 *
 * Scoped to this one component on purpose. It is the only file in the project where a deferred
 * build makes the guard nullish on an effect's first pass, and a project-wide rule would be a
 * false-positive generator for effects whose guard is null only after teardown.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE = fileURLToPath(new URL('../RebarViewport3D.svelte', import.meta.url));
const source = readFileSync(SOURCE, 'utf8');

/** The prop names the component destructures out of `$props()`. */
function propNames(src: string): string[] {
  const m = src.match(/const\s*\{([\s\S]*?)\}\s*:\s*Props\s*=\s*\$props\(\)/);
  if (!m) throw new Error('the `$props()` destructuring moved; this guard needs updating');
  return m[1]
    .split(',')
    .map((p) => p.split('=')[0].trim())
    .filter((p) => /^[A-Za-z_$][\w$]*$/.test(p));
}

/** Every `$effect(() => { ... })` body in the file, as source text. */
function effectBodies(src: string): string[] {
  const bodies: string[] = [];
  const opener = /\$effect\(\(\)\s*=>\s*\{/g;
  for (let m = opener.exec(src); m; m = opener.exec(src)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      i += 1;
    }
    expect(depth, 'an `$effect` body with unbalanced braces').toBe(0);
    bodies.push(src.slice(start, i - 1));
  }
  return bodies;
}

/**
 * Strip comments before looking for identifiers.
 *
 * The doc comment on the visibility effect quotes the broken line verbatim, and a guard that
 * read its own explanation as code would fail on the fix it exists to protect.
 */
function code(body: string): string {
  return body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const bodies = effectBodies(source).map(code);
const props = propNames(source);

describe('every effect in the 3-D viewport subscribes to what it acts on', () => {
  it('finds the effects at all', () => {
    // A guard that silently matched nothing would pass forever. The file has five effects; the
    // floor is deliberately loose, the point is only that the parse works.
    expect(bodies.length).toBeGreaterThanOrEqual(4);
    expect(props).toContain('filter');
    expect(props).toContain('showConcrete');
    expect(props).toContain('showConflicts');
  });

  for (const [i, body] of bodies.entries()) {
    it(`effect #${i + 1} reads its props before any optional-chained call`, () => {
      const guardAt = body.indexOf('?.');
      if (guardAt < 0) return; // Nothing can be short-circuited; nothing to prove.
      const before = body.slice(0, guardAt);
      for (const p of props) {
        const used = new RegExp(`\\b${p}\\b`).test(body);
        if (!used) continue;
        expect(
          new RegExp(`\\b${p}\\b`).test(before),
          `\`${p}\` is only mentioned inside a \`?.\`-guarded call, so this effect does not `
          + 'subscribe to it: the arguments of a short-circuited call are never evaluated, and '
          + 'a Svelte effect depends on what it actually read. Read it into a local first.',
        ).toBe(true);
      }
    });
  }

  it('the visibility effect reads all three of its inputs', () => {
    // Named separately from the generic rule, because this is the one that broke and because
    // the generic rule would also be satisfied by an effect that reads two of the three.
    const visibility = bodies.find((b) => b.includes('setVisibility'));
    expect(visibility, 'the visibility effect').toBeDefined();
    const before = visibility!.slice(0, visibility!.indexOf('?.'));
    for (const p of ['filter', 'showConcrete', 'showConflicts']) {
      expect(new RegExp(`\\b${p}\\b`).test(before), `${p} read before the guard`).toBe(true);
    }
  });

  it('publishes the built scene so a browser test can read what is drawn', () => {
    // The other half of the same lesson: the unit suite cannot see the scene, and the browser
    // suite was asserting the tally — which is the filter's own account of itself and was
    // updating perfectly while nothing reached the meshes.
    expect(source).toContain('setLiveRebarScene(built)');
    expect(source).toContain('setLiveRebarScene(null)');
  });
});
