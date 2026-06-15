/**
 * PR [12] global/local axis-convention audit gates.
 *
 * Canonical convention: Z-up, gravity = -Z. For a frame member:
 *   My = moment about local y; bends over the section DEPTH; uses Iy.
 *   Mz = moment about local z; bends over the section WIDTH; uses Iz.
 * In the DEFAULT (unrolled) orientation of a typical tall section, My corresponds
 * to depth/strong-axis bending and Mz to width/weak-axis bending — but a section
 * roll (rollAngle / section.rotation) rotates the strong/weak directions WITH the
 * section (roll is analysis-real: solver stiffness, force recovery, render, and
 * section analysis all honor it). So the labels must use precise local-axis
 * language, NOT an unconditional "My = strong / Mz = weak".
 *
 * NOTE: the RC/steel DESIGN modules (auto-verify.ts, cirsoc201.ts, ProVerificationTab)
 * intentionally keep "columns → Mz strong" (documented SEAM-3, fed directly by solver
 * forces) and are deliberately NOT gated here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('Section-analysis help uses precise local-axis language (roll-safe)', () => {
  const en = read('../../i18n/locales/en.ts');
  const es = read('../../i18n/locales/es.ts');

  it('EN moments help: My/Mz framed by local axis + inertia, with a roll caveat', () => {
    expect(en).toContain('My = moment about local y (bends over the depth, uses Iy)');
    expect(en).toContain('Mz = moment about local z (bends over the width, uses Iz)');
    expect(en).toContain('a section roll rotates these with the section');
    // sigma formula still present (en.ts stores the middot as the literal escape ·)
    expect(en).toContain('My\\u00B7y/Iy + Mz\\u00B7z/Iz');
    // No unconditional strong/weak plane claim.
    expect(en).not.toContain('My = bending moment (XZ plane, strong axis / depth)');
  });

  it('EN fiber help: depth↔My/Iy, width↔Mz/Iz, with a roll caveat', () => {
    expect(en).toContain('Y (depth): bending by My, uses Iy.');
    expect(en).toContain('Z (width): bending by Mz, uses Iz.');
    expect(en).toContain('a section roll rotates this');
    expect(en).not.toContain('Y = strong axis (height, bending by Mz)'); // original inverted bug
  });

  it('EN result tooltips name the local axis, not an unconditional strong/weak', () => {
    expect(en).toContain("'results.momentYTooltip': 'Moment about local y (My)'");
    expect(en).toContain("'results.momentZTooltip': 'Moment about local z (Mz)'");
    expect(en).not.toContain("'results.momentZTooltip': 'Strong axis moment (Mz)'");
  });

  it('ES tooltips + fiber help follow the same precise framing', () => {
    expect(es).toContain("'results.momentYTooltip': 'Momento sobre el eje local y (My)'");
    expect(es).toContain("'results.momentZTooltip': 'Momento sobre el eje local z (Mz)'");
    expect(es).toContain('Y (canto): flexión por My, usa Iy.');
  });
});

describe('Solver-force type comments use precise local-axis language', () => {
  it('types-3d.ts: My/Mz by local axis + depth/width + inertia (no "Mz = strong axis")', () => {
    const t = read('../types-3d.ts');
    expect(t).not.toContain('Bending about local Z (strong axis)');
    expect(t).not.toContain('local z (strong axis)');
    expect(t).toContain('My — moment about local y; bends over the section depth (uses Iy).');
    expect(t).toContain('Mz — moment about local z; bends over the section width (uses Iz).');
  });

  it('deformed-shape-3d.ts no longer calls Mz the strong axis', () => {
    const d = read('../../three/deformed-shape-3d.ts');
    expect(d).not.toContain('Mz = bending about local z, strong axis');
  });
});

describe('section-stress-3d.ts header documents the PR [12] biaxial formula', () => {
  it('TS engine states the My·y/Iy + Mz·z/Iz pairing', () => {
    const s = read('../section-stress-3d.ts');
    expect(s).toContain('My·y/Iy + Mz·z/Iz');
  });
});
