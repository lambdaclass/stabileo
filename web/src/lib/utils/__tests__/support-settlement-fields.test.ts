/**
 * A 2D support's settlement lives in `dz` and its imposed rotation in `dry` (PR #250 made them
 * canonical; `dy` and `drz` are legacy aliases `updateSupport` folds in). The drawing read only
 * the aliases, so a settlement typed in the supports table or the edit panel, stored as dz/dry,
 * was solved but never drawn; the supports table wrote the aliases.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { drawPrescribedDisp } from '../../viewport/draw-entities';

function recordingCtx() {
  const texts: string[] = [];
  const noop = () => {};
  const ctx = {
    lineWidth: 0, strokeStyle: '', fillStyle: '', font: '', textAlign: 'left', textBaseline: 'middle',
    beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, closePath: noop, fill: noop, arc: noop,
    fillText: (s: string) => { texts.push(s); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
}

describe('the 2D drawing of a settlement', () => {
  it('draws the canonical dz and dry', () => {
    const { ctx, texts } = recordingCtx();
    drawPrescribedDisp(ctx, { x: 0, y: 0 }, { dz: -0.01, dry: 0.002 }, 10);
    expect(texts).toEqual(['δz=-10.0 mm', 'δθy=2.00mrad']);
  });
  it('and a legacy file that still says dy and drz', () => {
    const { ctx, texts } = recordingCtx();
    drawPrescribedDisp(ctx, { x: 0, y: 0 }, { dy: -0.01, drz: 0.002 }, 10);
    expect(texts).toEqual(['δz=-10.0 mm', 'δθy=2.00mrad']);
  });
  it('the canonical field wins over a stale alias', () => {
    const { ctx, texts } = recordingCtx();
    drawPrescribedDisp(ctx, { x: 0, y: 0 }, { dz: -0.02, dy: -0.01 }, 10);
    expect(texts).toEqual(['δz=-20.0 mm']);
  });
});

describe('the supports table writes the canonical fields', () => {
  const src = readFileSync(fileURLToPath(new URL('../../../components/tables/SupportsTable.svelte', import.meta.url)), 'utf8');
  it('dz and dθy edit dz and dry, the fields they read', () => {
    expect(src).toContain("updateSupportSpring(sup.id, 'dz', String(v))");
    expect(src).toContain("updateSupportSpring(sup.id, 'dry', String(v))");
    expect(src).not.toContain("updateSupportSpring(sup.id, 'dy',");
    expect(src).not.toContain("updateSupportSpring(sup.id, 'drz',");
  });
});
