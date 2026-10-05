/**
 * Two things the load generator dialog showed that were not so.
 *
 * The roof pane's "Automatic (heavy/light)" class came from the plan, and the pane is only on
 * screen with no plan open (opening a section drops the preview), so it always showed the class
 * of the dead load alone: a concrete roof slab with light finishes read light. And closing the
 * dialog kept the preview, so reopening it after editing the model showed, and could apply, a
 * plan built against the model as it was.
 *
 * The component is read as source, as `edu/__tests__/author-wiring.test.ts` does: the property is
 * where a value comes from, which no unit below the component can see.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLoadPlan, roofWeightFor, type LoadModelData, type LoadPlanInput } from '../../../lib/engine/loads/load-plan';
import { roofWeightClass } from '../../../lib/codes/cirsoc101/roof-live';
import { defaultRegulations, type ProjectRegulations } from '../../../lib/codes/roles';

const dialog = readFileSync(join(process.cwd(), 'src/components/pro/ProAutoLoadsDialog.svelte'), 'utf8');

describe("the roof pane's automatic weight class", () => {
  it('is not read off the plan the pane never has', () => {
    expect(dialog).not.toMatch(/plan\?\.roofWeight/);
    const pane = dialog.match(/<ProRoofLoadSection[^>]*autoWeight=\{(\w+)\}/);
    expect(pane).not.toBeNull();
    // What the pane is given is computed by the plan's own rule, from the model.
    expect(dialog).toMatch(new RegExp(`const ${pane![1]} = \\$derived\\([^;]*roofWeightFor\\(`));
  });

  it('roofWeightFor finds the class the plan finds: a 20 cm concrete slab with light finishes is heavy', () => {
    // One 6 × 6 m bay at z = 3 under a slab of one shell, 0,20 m of concrete at 25 kN/m³.
    const nodes = new Map([[1, { id: 1, x: 0, y: 0, z: 3 }], [2, { id: 2, x: 6, y: 0, z: 3 }], [3, { id: 3, x: 6, y: 6, z: 3 }], [4, { id: 4, x: 0, y: 6, z: 3 }]]);
    const elements = new Map([[1, 2], [2, 3], [3, 4], [4, 1]].map(([i, j], k) => [k + 1, { id: k + 1, nodeI: i!, nodeJ: j!, sectionId: 1, materialId: 1 }]));
    const model: LoadModelData = {
      nodes, elements, sections: new Map([[1, { id: 1, a: 0.01 }]]), materials: new Map([[1, { id: 1, rho: 25 }]]),
      quads: new Map([[1, { id: 1, nodes: [1, 2, 3, 4], thickness: 0.2, materialId: 1 }]]), loadCases: [],
    };
    const dead = 0.3;
    expect(roofWeightClass(dead)).toBe('light');
    const gravity = { mode: 'panels' as const };
    expect(roofWeightFor(model, gravity, 3, dead)).toBe('heavy');
    const regulations = Object.fromEntries(Object.entries(defaultRegulations()).map(([k, v]) =>
      [k, v.adapterId ? { ...v, configComplete: true, state: 'applied' } : v])) as ProjectRegulations;
    const input: LoadPlanInput = {
      regulations, model, dead: [{ labelKey: 'a', q: 1 }], occupancyKey: 'vivienda', tributaryWidth: 3, gravity,
      reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: false,
      roof: { use: 'maintenance', dead, slopeDeg: 0 },
    };
    expect(buildLoadPlan(input).roofWeight).toBe(roofWeightFor(model, gravity, 3, dead));
  });
});

describe('closing the dialog', () => {
  it('drops the preview, so reopening never shows or applies a plan of an earlier model', () => {
    const effects = [...dialog.matchAll(/\$effect\(\(\) => \{([\s\S]*?)\n  \}\);/g)].map((m) => m[1]!);
    expect(effects.some((body) => /if \(!open\)/.test(body) && /plan = null/.test(body) && /delta = null/.test(body))).toBe(true);
  });
});

describe('the modes of the modal method', () => {
  it('are found under the level weights, whose live load is unreduced', () => {
    // The plan's level weights carry Lo; modes under the §4.7.2-reduced loads had a lighter mass
    // than the forces were spread over (see the consistency test in plan-gravity.test.ts).
    const call = dialog.match(/modesForPlan\((\w+),/);
    expect(call).not.toBeNull();
    expect(dialog).toMatch(new RegExp(`const ${call![1]} = [^;]*applyLiveReduction: false`));
  });
});
