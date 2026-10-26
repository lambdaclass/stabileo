/**
 * The verification detail's interaction diagram of a column. A circular, T or L column keeps
 * `longitudinal` beside `shaped` (`setShapedBars` writes both), and the detail used to resolve
 * that as a rectangle's bars and draw a rectangle's diagram. It now draws the section's own.
 *
 * Hand value: a Ø45 circle, 8Ø16 with a Ø10 spiral, H-25, ADN 420. Its axial ceiling, CIRSOC
 * 201-2025 Tabla 22.4.2.1 (b) with Tabla 21.2.2 (a): φPn,max = 0,75·0,85·Po,
 * Po = 0,85·f'c·(Ag − Ast) + fy·Ast, Ag = π·R² (the engine takes a circle as a circle).
 */
import { describe, it, expect } from 'vitest';
import { verificationColumnDiagram } from '../column-interaction';
import type { MemberContext } from '../member-context';
import type { ProvidedReinforcement } from '../../../store/model.svelte';

describe('the verification detail\'s column diagram', () => {
  const base = { elementType: 'column', material: { fc: 25, fy: 420, cover: 0.04, stirrupDia: 8 }, slenderDeltaNs: 1, slenderDeltaS: 1, stations: undefined, demands: undefined };

  it('a circular column gets its own curve, with the spiral\'s 2025 ceiling', () => {
    const ctx = { ...base, shape: { kind: 'circle', D: 0.45 }, section: { b: 0.45, h: 0.45 } } as unknown as MemberContext;
    const r: ProvidedReinforcement = {
      shaped: { count: 8, diameter: 16, spiral: { diameter: 10, pitch: 0.06 } },
      longitudinal: { count: 8, diameter: 16 },
    };
    const out = verificationColumnDiagram(ctx, r)!;
    expect(out.kind).toBe('shaped');
    if (out.kind !== 'shaped') return;
    const a16 = Math.PI * 0.016 ** 2 / 4;
    const Ag = Math.PI * 0.225 ** 2;
    const Po = 0.85 * 25000 * (Ag - 8 * a16) + 420000 * 8 * a16;
    expect(Math.max(...out.plot.overDepth.map((p) => p.P))).toBeCloseTo(0.75 * 0.85 * Po, 3);
  });

  it('a rectangle keeps the rectangular diagram', () => {
    const ctx = { ...base, shape: undefined, section: { b: 0.3, h: 0.3 } } as unknown as MemberContext;
    const r: ProvidedReinforcement = { column: { cornerDia: 16, faceDia: 16, nBottom: 0, nTop: 0, nLeft: 0, nRight: 0 } };
    const out = verificationColumnDiagram(ctx, r)!;
    expect(out.kind).toBe('rect');
  });
});
