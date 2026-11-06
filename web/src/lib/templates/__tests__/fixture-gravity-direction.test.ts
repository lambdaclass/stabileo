import { expectMembraneRefusal } from '../../engine/__tests__/containment-helper';
/**
 * Gravity loads in the shipped examples point down, and the solved examples stand in equilibrium.
 *
 * Member loads are written in each member's local axes. Since the move to Z-up, a horizontal
 * beam's local y is horizontal and its local z is up (`local-axes-3d.ts`), so a gravity load
 * belongs in qZ. Four examples kept members loaded along qY, a horizontal direction (in
 * 3d-building the dead load pushed the building sideways with 1440 kN against 900 kN of weight),
 * and two loaded inclined members normal to the member: hinged-arch-3d with 8·cos θ, the weight
 * projected by its old generator with the axial part dropped, and full-stadium's roof ring, whose
 * migration commit (440514253) calls them gravity loads. All six now act along global -Z. This file reads every
 * fixture through the same local axes the solver uses, so a member load in a dead or live
 * case that is not vertical, or points up, fails here by fixture, case and load.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { computeLocalAxes3D } from '../../engine/local-axes-3d';
import { buildSolverInput3D } from '../../engine/solver-service';
import { initSolver, solve3D } from '../../engine/wasm-solver';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store';

const DIR = 'src/lib/templates/fixtures';
/** Case types whose member loads are weight: dead, live and roof live. */
const GRAVITY = new Set(['D', 'L', 'Lr']);

interface Fixture {
  nodes: Array<{ id: number; x: number; y: number; z?: number }>;
  elements: Array<{ id: number; nodeI: number; nodeJ: number; rollAngle?: number; localY?: { x: number; y: number; z: number } }>;
  loads: Array<{ type: string; data: Record<string, number> }>;
  loadCases?: Array<{ id: number; type?: string }>;
}

/** The global force of one distributed3d load, kN: its mean intensity times the loaded length, through the member's axes. */
function globalForce(fx: Fixture, data: Record<string, number>): [number, number, number] {
  const el = fx.elements.find((e) => e.id === data.elementId)!;
  const at = (id: number) => { const n = fx.nodes.find((m) => m.id === id)!; return { id, x: n.x, y: n.y, z: n.z ?? 0 }; };
  const ax = computeLocalAxes3D(at(el.nodeI), at(el.nodeJ), el.localY, el.rollAngle);
  const a = data.a ?? 0, b = data.b ?? ax.L;
  const qy = ((data.qYI ?? 0) + (data.qYJ ?? 0)) / 2 * (b - a);
  const qz = ((data.qZI ?? 0) + (data.qZJ ?? 0)) / 2 * (b - a);
  if ((data as { frame?: string }).frame === 'global') return [0, qy, qz];
  return [0, 1, 2].map((i) => qy * ax.ey[i] + qz * ax.ez[i]) as [number, number, number];
}

const fixtures = readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => ({
  name: f.replace(/\.json$/, ''),
  json: JSON.parse(readFileSync(join(DIR, f), 'utf8')) as Fixture,
}));

/*
 * A dead-case member load that is meant not to be vertical, with where that intent is written.
 * Checked below to still hold its tilted load, so removing the intent also means removing it here.
 */
const INTENTIONAL: Record<string, string> = {
  // docs/qa/QA3_RC_WORKFLOW_FEEDBACK_2026-04-18.md:116, "Add horizontal loads to elements 19
  // and 20 so they show combined My + Mz behavior": 4 kN/m along local y on two roof beams.
  'rc-qa-diagnostic': 'horizontal load on members 19 and 20 for combined My + Mz (QA3, 2026-04-18)',
};

describe('member loads in dead and live cases are vertical and downward', () => {
  for (const { name, json } of fixtures) {
    const caseType = new Map((json.loadCases ?? []).map((c) => [c.id, c.type]));
    const members = (json.loads ?? []).filter((l) => l.type === 'distributed3d' && GRAVITY.has(caseType.get(l.data.caseId ?? 1) ?? ''));
    if (members.length === 0) continue;
    it(name, () => {
      const wrong: string[] = [];
      const tilted: number[] = [];
      for (const l of members) {
        const [gx, gy, gz] = globalForce(json, l.data);
        const size = Math.hypot(gx, gy, gz);
        if (size === 0) continue;
        // Horizontal outright, or pointing up: wrong in every fixture, listed or not.
        if (Math.abs(gz) <= 1e-9 * size || gz > 0) wrong.push(`load ${l.data.id} on member ${l.data.elementId}: (${gx.toFixed(2)}, ${gy.toFixed(2)}, ${gz.toFixed(2)}) kN`);
        else if (Math.hypot(gx, gy) > 1e-9 * size) tilted.push(l.data.id);
      }
      expect(wrong, `${name}: ${wrong.length} of ${members.length} gravity member loads are horizontal or point up`).toEqual([]);
      if (name in INTENTIONAL) expect(tilted.length, `${name} is listed as tilted on purpose (${INTENTIONAL[name]}) but none is`).toBeGreaterThan(0);
      else expect(tilted, `${name}: ${tilted.length} of ${members.length} gravity member loads are not vertical`).toEqual([]);
    });
  }
});

describe('the corrected examples are in equilibrium under their dead load', () => {
  beforeAll(async () => { await initSolver(); uiStore.analysisMode = 'pro'; });

  for (const name of ['3d-building', 'space-frame', 'torre-irregular-con-retiros', 'la-bombonera', 'full-stadium', 'hinged-arch-3d']) {
    it(name, async () => {
      await modelStore.loadExample(name);
      const model = modelStore.model;
      const deadId = (model.loadCases.find((c) => c.type === 'D') ?? { id: 1 }).id;
      const loads = model.loads.filter((l) => ((l.data as { caseId?: number }).caseId ?? 1) === deadId);
      // The example brings its own self-weight into every solve; what the case's loads add is
      // the difference against the same model with no loads of its own.
      const reactions = (own: typeof loads) => {
        const input = buildSolverInput3D({ ...model, loads: own }, false);
        expect(input).not.toBeNull();
        const r = solve3D(input!) as unknown as { reactions: Array<{ fx: number; fy: number; fz: number }> };
        return r.reactions.reduce((s, x) => [s[0] + x.fx, s[1] + x.fy, s[2] + x.fz], [0, 0, 0]);
      };
      // What the case applies, summed from the fixture through the solver's axes.
      const fixture = fixtures.find((f) => f.name === name)!.json;
      const applied = [0, 0, 0];
      for (const l of fixture.loads.filter((x) => (x.data.caseId ?? 1) === deadId)) {
        if (l.type === 'distributed3d') globalForce(fixture, l.data).forEach((v, i) => { applied[i] += v; });
        if (l.type === 'nodal3d') { applied[0] += l.data.fx ?? 0; applied[1] += l.data.fy ?? 0; applied[2] += l.data.fz ?? 0; }
      }
      expect(applied[2]).toBeLessThan(0);
      expect(Math.hypot(applied[0], applied[1])).toBeLessThan(1e-6 * Math.abs(applied[2]));
      if (['full-stadium', 'la-bombonera'].includes(name)) {
        expectMembraneRefusal(() => solve3D(buildSolverInput3D({ ...model, loads }, false)!));
        // Post-fix: |reaction + applied| < 1e-6*|applied[2]| + 1e-6 in all three axes.
        return;
      }
      const withLoads = reactions(loads), bare = reactions([]);
      const react = withLoads.map((v, i) => v - bare[i]);


      for (let i = 0; i < 3; i++) {
        expect(Math.abs(react[i] + applied[i]), `${name}: ΣR${'xyz'[i]} = ${react[i].toFixed(3)} against applied ${applied[i].toFixed(3)} kN`)
          .toBeLessThan(1e-6 * Math.abs(applied[2]) + 1e-6);
      }
    });
  }
});
