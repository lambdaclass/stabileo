import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { axesStore } from '../axes.svelte';
import { makeFrame, planeSigns, toUser, pseudoToUser, type AxesChoice } from '../frame';
import { twoD } from '../display';
import { planeInputIn } from '../plane-input';
import { stepDocIn, stepTextIn } from '../step-doc-frame';
import { dsmInFrame } from '../dsm-frame';
import { planeStatement } from '../statement';
import { modelStore } from '../../store/model.svelte';
import { initSolver } from '../../engine/wasm-solver';
import { planeModel } from '../../engine/steps/plane-model';
import { solveReference } from '../../engine/steps/reference';
import type { MethodContext } from '../../engine/steps/registry';
import type { Block, StepDoc } from '../../engine/steps/doc';
import { methods as deformation } from '../../engine/steps/methods/deformation';
import { methods as trusses } from '../../engine/steps/methods/trusses';
import { solveDetailed } from '../../engine/solver-detailed';
import { solveDetailed3D } from '../../engine/solver-detailed-3d';
import { componentShown } from '../../../components/fm/fm-text';
import { t } from '../../i18n';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); });
afterEach(() => axesStore.reset());

const Y_UP: AxesChoice = { up: '+Y', right: '+X', hand: 'right' };
const LEFT: AxesChoice = { up: '+Z', right: '-X', hand: 'right' };
const DOWN: AxesChoice = { up: '-Y', right: '+Z', hand: 'left' };
const FRAMES = [Y_UP, LEFT, DOWN];

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

function ctxIn(choice: AxesChoice): MethodContext {
  const input = planeInputIn(modelStore.buildSolverInput(false)!, makeFrame(choice));
  return { input, pm: planeModel(input), ref: solveReference(input), selection: { members: [], nodes: [] } };
}

function compares(doc: StepDoc): Array<{ label: string; method: number; matrix: number }> {
  const out: Array<{ label: string; method: number; matrix: number }> = [];
  const walk = (b: Block) => { if (b.kind === 'compare') out.push(...b.rows); if (b.kind === 'sub') b.blocks.forEach(walk); };
  for (const s of doc.steps) s.blocks.forEach(walk);
  return out;
}

function texts(doc: StepDoc): string {
  return JSON.stringify(doc);
}

describe('the explained methods in the user axes', () => {
  it('the plane model in the user coordinates solves to the results the app shows, in every plane frame', async () => {
    await modelStore.loadExample('portal-frame');
    const base = solveReference(modelStore.buildSolverInput(false)!)!;
    for (const c of FRAMES) {
      axesStore.choice = c;
      const ref = ctxIn(c).ref!;
      for (const [id, r] of base.reactions) {
        const u = ref.reactions.get(id)!;
        close(u.rx, twoD.x(r.rx)); close(u.rz, twoD.z(r.rz)); close(u.my, twoD.rot(r.my));
      }
      for (const [id, d] of base.displacements) {
        const u = ref.displacements.get(id)!;
        close(u.ux, twoD.x(d.ux)); close(u.uz, twoD.z(d.uz)); close(u.ry, twoD.rot(d.ry));
      }
      for (const [id, n] of base.axial) close(ref.axial.get(id)!, n);
    }
  });

  it('a document built in the user coordinates agrees with its own matrix solve, and names the user axes', async () => {
    await modelStore.loadExample('portal-frame');
    const castigliano = deformation.find((m) => m.id === 'castigliano')!;
    for (const c of FRAMES) {
      axesStore.choice = c;
      const ctx = ctxIn(c);
      expect(castigliano.applies(ctx).ok).toBe(true);
      const doc = stepDocIn(castigliano.build!(ctx), makeFrame(c));
      const rows = compares(doc);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(Math.abs(r.method - r.matrix) / Math.max(1, Math.abs(r.matrix)), r.label).toBeLessThan(1e-6);
      const p = planeSigns(makeFrame(c));
      const all = texts(doc);
      expect(all).toContain(`R_${p.v.toLowerCase()}`);
      if (p.v !== 'Z' && p.h !== 'Z') expect(all).not.toMatch(/R_z\b/);
    }
  });

  it('a mirrored frame draws the figures as the viewport does, and says how to read right, up and counterclockwise', async () => {
    await modelStore.loadExample('portal-frame');
    const castigliano = deformation.find((m) => m.id === 'castigliano')!;
    const f = makeFrame(LEFT);
    axesStore.choice = LEFT;
    const doc = stepDocIn(castigliano.build!(ctxIn(LEFT)), f);
    expect(texts(doc)).toContain('"mirror":[-1,1]');
    expect(planeStatement(t, LEFT)).toContain('+X');
    expect(stepDocIn(castigliano.build!(ctxIn(Y_UP)), makeFrame(Y_UP)).intro.some((b) => JSON.stringify(b).includes('mirror'))).toBe(false);
  });

  it('a truss document names its global components in the user axes', async () => {
    await modelStore.loadExample('truss');
    const joints = trusses.find((m) => m.id === 'joints')!;
    axesStore.choice = Y_UP;
    const ctx = ctxIn(Y_UP);
    expect(joints.applies(ctx).ok).toBe(true);
    const doc = stepDocIn(joints.build!(ctx), makeFrame(Y_UP));
    expect(texts(doc)).not.toMatch(/R_z\b/);
    expect(stepTextIn(makeFrame(Y_UP), 'steps.trusses.reactionsCaption', 'Reactions (positive toward +x, toward +z and counterclockwise).')).toBe('Reactions (positive toward +x, toward +y and counterclockwise).');
    expect(stepTextIn(makeFrame(Y_UP), 'steps.cuts.intro.membersCaption', 'the angle of the local x axis from the global X axis')).toBe('the angle of the local x axis from the global X axis');
    expect(stepTextIn(makeFrame({ up: '+X', right: '+Y', hand: 'right' }), 'steps.cuts.intro.membersCaption', 'the angle of the local x axis from the global X axis')).toBe('the angle of the local x axis from the global Y axis');
  });
});

describe('the stiffness wizard in the user axes', () => {
  it('every global matrix and vector is the same system written in the user axes (2D)', async () => {
    await modelStore.loadExample('portal-frame');
    const data = solveDetailed(modelStore.buildSolverInput(false)!);
    for (const c of FRAMES) {
      const f = makeFrame(c);
      const p = planeSigns(f);
      const d = dsmInFrame(data, f);
      const nf = d.dofNumbering.nFree;
      // Kff·uf = Ff − Kfr·ur, in the user axes.
      d.Kff.forEach((row, i) => close(row.reduce((a, k, j) => a + k * d.uFree[j]!, 0), d.FfMod[i]!));
      // Each member: [T]·u_global = u_local, the local side unchanged.
      for (const ef of d.elementForces) {
        const e = d.elements.find((x) => x.elementId === ef.elementId)!;
        e.T.forEach((row, i) => close(row.reduce((a, k, j) => a + k * ef.uGlobal[j]!, 0), ef.uLocal[i]!));
      }
      // The reactions are the app's: horizontal, vertical and moment with the user's signs.
      for (const dof of d.dofNumbering.dofs) {
        if (dof.isFree) continue;
        const s = [p.sx, p.sz, p.sr][dof.localDof]!;
        close(d.reactionsRaw[dof.globalIndex - nf]!, s * data.reactionsRaw[dof.globalIndex - nf]!);
      }
    }
  });

  it('a space structure\'s DOFs are renamed and signed per node, and its system still holds (3D)', () => {
    modelStore.clear();
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3), c = modelStore.addNode(4, 2, 3);
    modelStore.addElement(a, b); modelStore.addElement(b, c);
    modelStore.addSupport(a, 'fixed3d' as never); modelStore.addSupport(c, 'pinned3d' as never);
    modelStore.addNodalLoad3D(b, 5, -2, -10, 1, 0, 0.5, 1);
    const input = modelStore.buildSolverInput3D(false)!;
    const data = solveDetailed3D(input);
    const f = makeFrame(DOWN);
    const d = dsmInFrame(data, f);
    d.Kff.forEach((row, i) => close(row.reduce((acc, k, j) => acc + k * d.uFree[j]!, 0), d.FfMod[i]!));
    for (const ef of d.elementForces) {
      const e = d.elements.find((x) => x.elementId === ef.elementId)!;
      e.T.forEach((row, i) => close(row.reduce((acc, k, j) => acc + k * ef.uGlobal[j]!, 0), ef.uLocal[i]!));
    }
    // Node b's displacements read as the user's vector, its rotations as the user's pseudovector.
    const at = (dd: typeof d, k: number) => dd.uAll[dd.dofNumbering.dofs.find((x) => x.nodeId === b && x.localDof === k)!.globalIndex]!;
    const um = [0, 1, 2].map((k) => at(data, k)) as [number, number, number];
    const rm = [3, 4, 5].map((k) => at(data, k)) as [number, number, number];
    toUser(f, um).forEach((v, k) => close(at(d, k), v));
    pseudoToUser(f, rm).forEach((v, k) => close(at(d, 3 + k), v));
  });
});

describe('the flexibility wizard in the user axes', () => {
  it('names and signs a reaction component as the app shows it', () => {
    axesStore.choice = Y_UP;
    expect(componentShown(1)).toEqual({ name: 'Ry', sign: 1 });
    expect(componentShown(2)).toEqual({ name: 'M', sign: 1 });
    axesStore.choice = LEFT;
    expect(componentShown(0)).toEqual({ name: 'Rx', sign: -1 });
    expect(componentShown(2).sign).toBe(-1);
    axesStore.choice = Y_UP;
    expect(componentShown(2, false, true)).toEqual({ name: 'Ry', sign: 1 });
    expect(componentShown(1, false, true)).toEqual({ name: 'Rz', sign: -1 });
  });
});
