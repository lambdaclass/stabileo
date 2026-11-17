import { expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { capture } from '../../results-snapshot/capture';
import { CORPUS } from '../../results-snapshot/corpus';
import { verificationStore } from '../../store/verification.svelte';
import { REBAR_DB } from '../codes/argentina/cirsoc201';
import { evaluateBeamSection } from '../codes/argentina/cirsoc201-beam-kernel';
import { columnShearSpacing, columnTieSpacing, LENGTH_EPS, transverseSpacingLimits } from '../../codes/cirsoc201/transverse-spacing';

const fixtures = [
  { name: 'design-rc-design-qa-row2', secondaryIds: [1, 2, 3, 4] },
  { name: 'design-rc-qa-diagnostic', secondaryIds: Array.from({ length: 26 }, (_, i) => i + 1) },
];

for (const { name, secondaryIds } of fixtures) {
  it(`#2171 snapshot shear capacities use the actual directional counts: ${name}`, async () => {
    const snapshot = await capture(CORPUS.find(c => c.name === name)!);
    const rows = [];
    for (const v of verificationStore.concrete) {
      for (const [direction, sh] of [['primary', v.shear], ['secondary', v.shearSecondary]] as const) {
        if (!sh) continue;
        const concurrent = v.concurrentChecks?.find(c => {
          const s = direction === 'primary' ? c.verification.shear : c.verification.shearSecondary;
          return s?.phiVn === sh.phiVn && s.ratio === sh.ratio && s.Vu === sh.Vu;
        });
        expect(concurrent).toBeDefined();
        const local = concurrent!.verification;
        const b = direction === 'primary' ? local.b : local.h;
        const h = direction === 'primary' ? local.h : local.b;
        const area = REBAR_DB.find(r => r.diameter === sh.stirrupDia)!.area * 1e-4;
        const native = evaluateBeamSection({ edition: '2025', b, h, d: sh.d, fc: local.fc * 1e6, fy: local.fy * 1e6,
          As: direction === 'primary' ? local.flexure.AsProv * 1e-4 : 0,
          Av: sh.stirrupLegs * area, s: sh.spacing, fyt: local.fy * 1e6, Ag: b * h,
          NuCompression: concurrent!.demand.section(local.flexureAxis ?? 'My').Nu * 1e3 })!;
        expect(sh.phiVn).toBe(native.phiVn / 1000);
        expect(sh.ratio).toBe(sh.Vu / sh.phiVn);
        expect(sh.effectiveLegs.direction).toBe(direction);
        expect(sh.effectiveLegs.count).toBe(sh.stirrupLegs);
        if (direction === 'secondary') expect(sh.stirrupLegs).toBe(2);
        const table = transverseSpacingLimits('2025', { VsRequired: sh.Vs, bw: b, d: sh.d, fc: local.fc, cover: local.cover, stirrupDiaMm: sh.stirrupDia });
        if (local.elementType === 'beam') {
          if (sh.stirrupLegs < table.requiredLegs) expect(sh.status).toBe('fail');
        } else {
          const limit = columnShearSpacing('2025', { Vu: sh.Vu, phiVc: 0.75 * native.Vc / 1000, Vs: native.Vs / 1000, bw: b, d: sh.d, fc: local.fc });
          const ordinary = columnTieSpacing('2025', local.column!.barDia, sh.stirrupDia, Math.min(b, h));
          expect(limit.kind).not.toBe('unsupported');
          if (sh.spacing > ordinary.spacing + LENGTH_EPS || limit.kind === 'required' && sh.spacing > limit.alongMax + LENGTH_EPS) expect(sh.status).toBe('fail');
          expect(sh.steps.some(step => typeof step !== 'string' && step.key === 'codes.cirsoc201.shear.legsInsufficient')).toBe(false);
        }
        rows.push({ elementId: v.elementId, direction, width: b, height: h, depth: sh.d, legs: sh.stirrupLegs,
          requiredLegs: local.elementType === 'beam' ? table.requiredLegs : 2, spacing: sh.spacing, phiVn: sh.phiVn, nativePhiVn: native.phiVn / 1000, demand: sh.Vu, ratio: sh.ratio, status: sh.status });
      }
    }
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter(r => r.direction === 'secondary').map(r => r.elementId).sort((a, b) => a - b)).toEqual(secondaryIds);
    if (process.env.DIRECTIONAL_SNAPSHOT_AUDIT) {
      const before = JSON.parse(readFileSync(new URL(`../../../../results-snapshots/${name}.json`, import.meta.url), 'utf8'));
      writeFileSync(`${process.env.DIRECTIONAL_SNAPSHOT_AUDIT}/${name}.json`, JSON.stringify({ before, after: snapshot, rows }, null, 2));
    }
  });
}
