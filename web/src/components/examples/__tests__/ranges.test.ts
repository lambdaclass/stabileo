import { describe, it, expect } from 'vitest';
import * as engine from '../../../lib/engine/wasm-solver';
import { EXAMPLES } from '../catalog';
import { defaults, type Values } from '../define';
import { rcColumn, barsTied } from '../rc-column';

const EXPECTED_REFUSALS: Record<string, string> = { 'beam-frame load=0': 'noLoad' };

function outcome(id: string, extra: Values) {
  const example = EXAMPLES.find(e => e.id === id)!;
  const v = { ...defaults(example.params), ...extra };
  return example.analyses(example.build(v), v, engine);
}

describe('example slider ranges', () => {
  for (const example of EXAMPLES) for (const p of example.params) for (const at of [...new Set([p.min, p.max])]) {
    const name = `${example.id} ${p.key}=${at}`;
    it(`${name} ${EXPECTED_REFUSALS[name] ? `refuses with ${EXPECTED_REFUSALS[name]}` : 'solves'} from the defaults`, () => {
      const out = outcome(example.id, { [p.key]: at });
      expect(out.status === 'refused' ? out.code : 'ok').toBe(EXPECTED_REFUSALS[name] ?? 'ok');
    });
  }

  it('rc-column solves at every width with the default three bars per face, and still refuses an untied middle bar', () => {
    const b = rcColumn.params.find(p => p.key === 'b')!;
    expect([b.min, b.max]).toEqual([0.25, 0.45]);
    for (let k = 0; b.min + k * b.step <= b.max + 1e-9; k++) {
      const out = outcome('rc-column', { b: Number((b.min + k * b.step).toPrecision(12)) });
      expect(out.status === 'refused' ? out.code : 'ok').toBe('ok');
    }
    const v = { ...defaults(rcColumn.params), b: 0.45, barDia: 12 };
    expect(barsTied(v)).toBe(false);
    const out = outcome('rc-column', { b: 0.45, barDia: 12 });
    expect(out.status === 'refused' && out.code).toBe('needsCrossties');
  });
});

describe('example drawings', () => {
  it('give every overlay of an undeformed and a deformed shape a legend with its magnification', () => {
    const legends: Record<string, string[]> = {};
    for (const example of EXAMPLES) {
      const out = outcome(example.id, {});
      if (out.status !== 'ok') throw new Error(`${example.id} refused`);
      for (const [key, view] of Object.entries(out.views)) {
        if (view.legend?.shape === 'deformed') {
          expect(view.legend.scale).toBeGreaterThan(1);
          expect(Number.isFinite(view.legend.scale)).toBe(true);
        }
        if (view.legend) (legends[example.id] ??= []).push(`${key}:${view.legend.shape}`);
      }
    }
    expect(legends).toEqual({
      'beam-frame': ['deflection:deformed'],
      'earthquake-frame': ['deformed:deformed'],
      outrigger: ['outrigger:deformed'],
      tower: ['mode1:mode', 'mode2:mode', 'mode3:mode', 'buckling:mode'],
    });
  });

  it('draws the outrigger deformed shape at the magnification the legend states', () => {
    const out = outcome('outrigger', {});
    if (out.status !== 'ok') throw new Error('refused');
    const view = out.views.outrigger;
    const drift = out.readouts.find(r => r.key === 'topDrift')!.value / 1000;
    const height = 40 * 3.5;
    expect(view.legend!.scale!).toBeCloseTo(height * 0.08 / Math.abs(drift), 6);
  });
});
