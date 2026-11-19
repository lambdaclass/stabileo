import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { axesStore } from '../axes.svelte';
import {
  axisRatios, ilShown, ilText, modelDofIndex, planeName, ratiosText, relabelAxes, relabelComponents,
  shownDof, shownDofSymbol, supportTypeShown, userVecParts,
} from '../user-names';
import { twoD } from '../display';
import { axesLabel } from '../../canvas/draw-loads';
import { inspectMember } from '../../canvas/draw-despiece';
import { freeBodyActions2D } from '../../canvas/free-body-2d';
import { dofIndicesToNames, constraintLabel } from '../../model/constraint-labels';
import { kinDofSymbol, generateKinematicReport } from '../../engine/kinematic-report';
import { reactionDofLabel, readDisplayedReaction } from '../../../components/edu/edu-reactions';
import { allChoices } from '../frame';
import type { SolverInput } from '../../engine/types';

const ODD = { up: '+Y', right: '-Z', hand: 'left' } as const;

afterEach(() => { axesStore.reset(); });

describe('names and values of the Basic screens under the default frame', () => {
  it('leave every label and value as it was', () => {
    expect(relabelAxes('XZ plane (front)')).toBe('XZ plane (front)');
    expect(shownDof('uz')).toBe('uz');
    expect(kinDofSymbol('θy')).toBe('θy');
    expect(axesLabel(true, 30)).toBe(' [Z 30°]');
    expect(ilText('Rz', 'Rz vertical')).toBe('Rz vertical');
    expect(ratiosText([0.1, 0, 0.3], false, 0, ', ')).toBe('X=10%, Z=30%');
    expect(supportTypeShown('rollerXY')).toBe('rollerXY');
    expect([0, 1, 2, 3, 4, 5].map(modelDofIndex)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('names and values of the Basic screens under a frame with Y up, Z to the left, left-handed', () => {
  beforeEach(() => { axesStore.choice = { ...ODD }; });

  it('names the plane and the 2D axes after the user axes', () => {
    expect(twoD.horizontal).toBe('Z');
    expect(twoD.vertical).toBe('Y');
    expect(relabelAxes('XZ plane (front)')).toBe('YZ plane (front)');
    expect(relabelAxes('X/Z')).toBe('Z/Y');
    expect(planeName('XY')).toBe('XZ');
    expect(supportTypeShown('rollerXZ')).toBe('rollerYZ');
    expect(relabelComponents('Global Fx·Fz')).toBe('Global Fz·Fy');
    expect(relabelComponents('δθy')).toBe('δθx');
  });

  it('names degrees of freedom by the user axis and keeps unknown codes', () => {
    expect(shownDof('ux')).toBe('uz');
    expect(shownDof('uz')).toBe('uy');
    expect(shownDof('rx')).toBe('rz');
    expect(shownDofSymbol('ry')).toBe('θx');
    expect(shownDof('u_n')).toBe('u_n');
    expect(kinDofSymbol('ux')).toBe('uz');
    expect(kinDofSymbol('uz')).toBe('uy');
    expect(kinDofSymbol('θy')).toBe('θx');
  });

  it('maps a toggle on a user degree of freedom to the model one and back', () => {
    expect([0, 1, 2, 3, 4, 5].map(modelDofIndex)).toEqual([1, 2, 0, 4, 5, 3]);
    for (const c of allChoices()) {
      axesStore.choice = c;
      const seen = new Set([0, 1, 2, 3, 4, 5].map(modelDofIndex));
      expect(seen.size).toBe(6);
      for (let i = 0; i < 6; i++) expect(modelDofIndex(i) < 3).toBe(i < 3);
    }
  });

  it('gives vector components in user order with their signs', () => {
    expect(userVecParts('F', [1, 2, 3])).toEqual([{ name: 'Fx', value: 2 }, { name: 'Fy', value: 3 }, { name: 'Fz', value: -1 }]);
    const m = userVecParts('M', [1, 2, 3], true);
    expect(m.map((c) => c.name)).toEqual(['Mx', 'My', 'Mz']);
    expect(m.map((c) => c.value)).toEqual([-2, -3, 1]);
  });

  it('orders mass ratios by user axis without signs', () => {
    expect(axisRatios([0.1, 0.2, 0.3], true)).toEqual([{ name: 'X', value: 0.2 }, { name: 'Y', value: 0.3 }, { name: 'Z', value: 0.1 }]);
    expect(ratiosText([0.1, 0, 0.3], false, 0, ', ')).toBe('Z=10%, Y=30%');
  });

  it('labels a global load direction and its angle in the user plane', () => {
    expect(axesLabel(true, 0)).toBe(' [Y]');
    expect(axesLabel(true, 90)).toBe(' [Z]');
    expect(axesLabel(true, 30)).toBe(' [Y -30°]');
    expect(axesLabel(false, 30)).toBe(' [⊥ 30°]');
  });

  it('reads influence-line quantities in the user frame, the engine name unchanged', () => {
    expect(ilShown('Rz')).toEqual({ symbol: 'Ry', sign: 1 });
    expect(ilShown('Rx')).toEqual({ symbol: 'Rz', sign: -1 });
    expect(ilShown('My')).toEqual({ symbol: 'Mx', sign: -1 });
    expect(ilShown('M')).toEqual({ symbol: 'M', sign: 1 });
    expect(ilText('Rx', 'Signo: Rx es positiva hacia +X.')).toBe('Signo: Rz es positiva hacia +Z.');
    expect(ilText('uz', 'uz vertical')).toBe('uy vertical');
    expect(ilText('ry', 'θ giro')).toBe('θ giro');
  });

  it('grades an Education reaction as the results table shows it', () => {
    const results = { reactions: [{ nodeId: 1, rx: 5, rz: 7, my: 2 }] } as never;
    expect(readDisplayedReaction(results, 1, 'Rx')).toBe(-5);
    expect(readDisplayedReaction(results, 1, 'Ry')).toBe(7);
    expect(readDisplayedReaction(results, 1, 'M')).toBe(2);
    expect(reactionDofLabel('Rx')).toBe('Rz');
    expect(reactionDofLabel('Ry')).toBe('Ry');
    expect(reactionDofLabel('M')).toBe('M');
  });

  it('names a constraint by the user axes', () => {
    const t = (k: string) => (k === 'pro.constraintEqDof' ? '{master}→{slave} {dofs}' : k === 'pro.constraintEcc' ? '{offset}' : k);
    expect(dofIndicesToNames([0, 5], t)).toBe('uz,ry');
    expect(constraintLabel({ type: 'eccentricConnection', masterNode: 1, slaveNode: 2, offsetX: 1, offsetY: 2, offsetZ: 3 }, t)).toContain('(2, 3, -1)');
  });

  it('names and signs the global end actions of the 2D despiece, with the engine component kept', () => {
    const args = {
      elements: [{ id: 1, nodeI: 1, nodeJ: 2, type: 'frame' }] as never,
      getNode: (id: number) => (id === 1 ? { x: 0, y: 0 } : { x: 4, y: 0 }),
      getElementForces: () => ({ elementId: 1, nStart: 10, nEnd: 10, vStart: 5, vEnd: -5, mStart: 0, mEnd: 0 }) as never,
      basis: 'global' as const,
    };
    axesStore.reset();
    const plain = inspectMember(args, 1)!.ends[0]!.components;
    axesStore.choice = { ...ODD };
    const shown = inspectMember(args, 1)!.ends[0]!.components;
    expect(shown.map((c) => c.label)).toEqual(['Fz', 'Fy', 'M']);
    expect(shown[0]!.value).toBeCloseTo(-plain[0]!.value);
    expect(shown[1]!.value).toBeCloseTo(plain[1]!.value);
    const fb = freeBodyActions2D({
      ...args, reactions: new Map([[1, { rx: 3, rz: 4, my: 1 }]]) as never, resultant: false, showReactions: true,
    });
    expect(fb.supports[0]!.actions.map((a) => a.name)).toEqual(['Rz', 'Ry', 'Mx']);
    expect(fb.ends.flatMap((e) => e.actions.map((a) => a.name))).toContain('Fz');
  });

  it('writes a spring support of the kinematic report in user names and still counts it', () => {
    const input = {
      nodes: new Map([[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 4, y: 0 }]]),
      materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
      sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
      elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'spring', kx: 1000, ky: 1000, kz: 1000 }], [2, { id: 2, nodeId: 2, type: 'rollerX' }]]),
      loads: [],
    } as unknown as SolverInput;
    const report = generateKinematicReport(input)!;
    const spring = report.supportDetails.find((s) => s.nodeId === 1)!;
    expect(spring.restrainedDofs).toBe('uz, uy, θx');
    expect(spring.restrained).toEqual(['ux', 'uz', 'θy']);
    expect(report.supportDetails.find((s) => s.nodeId === 2)!.restrainedDofs).toBe('uy');
    const lines = report.elementAnalysis[0]?.dofBreakdown.lines ?? [];
    expect(lines.map((l) => l.dof)).toEqual(['ux', 'uz', 'θy']);
    expect(lines.every((l) => l.sources.length > 0)).toBe(true);
  });
});

const SRC = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

describe('Basic screens that show global axes go through the display layer', () => {
  const seam: Record<string, RegExp[]> = {
    'components/Viewport3D.svelte': [/addNodeWelded\(x, y, z\)/, /\.replace\('\{x\}', `\$\{fmtCoord\(n\.x\)\}`\)/, /\{ax\.toUpperCase\(\)\}/],
    'components/viewport/QuickInfoCard.svelte': [/fmtQ\(disp\.ux,/, /fmtQ\(reac\.fx,/, /fmtCoord\(node\.x\)/],
    'components/floating-tools/ToolNodeOptions.svelte': [/>XY<\/button>/, /jointDof3d\[i\]/, /planeLevelAxis\(uiStore\.workingPlane\)\.toUpperCase\(\)/],
    'components/ElementEditor.svelte': [/checked=\{dof\[i\]\}/],
    'components/SwitchTo2DDialog.svelte': [/\{p\.label\}/, /\{normal\} = \{fmt\(c\.value\)\}/],
    'components/Toolbar.svelte': [/<span class="plane-label">\{label\}<\/span>/],
    'components/SelectionPanel.svelte': [/tp\('selection\.axis', \{ d \}\)/],
    'components/WhatIfPanel.svelte': [/`Fx=\$\{F\(d\.fx\)\}`/, /`My=\$\{M\(/],
    'components/KinematicPanel.svelte': [/\{line\.dof\}/],
    'components/toolbar/ToolbarAdvanced.svelte': [/X=\{\(mode\.massRatioX/, /DOF_LABEL_KEY\[dof\]/],
    'components/advanced/dynamics/ModalExplain.svelte': [/<td>\{d\}<\/td>/],
    'components/advanced/plastic/PlasticCurve.svelte': [/d === 'ry' \? 'θ' : d\)/],
    'components/advanced/InfluencePanel.svelte': [/>\{t\(qq\.labelKey\)\}</],
    'components/ribbon/ToolOptions.svelte': [/>\{t\(q\.labelKey\)\}</],
    'components/FloatingTools.svelte': [/>\{t\(q\.labelKey\)\}</],
    'components/edu/EduExerciseView.svelte': [/\{dof\} =/],
    'components/edu/edu-reactions.ts': [/\? reaction\.rx :/],
    'components/property/MemberOffsetEditor.svelte': [/ox = vec\.x;/],
    'components/DespieceOptions.svelte': [/despieceBasis = o\.id\)\}>\{t\(o\.key\)\}/],
    'lib/canvas/draw-despiece.ts': [/labelText: `Rx /, /label: 'Fx'/],
    'lib/canvas/draw-loads.ts': [/' \[Z\]'/, /`\$\{ptCasePrefix\}My=/],
    'lib/canvas/free-body-2d.ts': [/name: v\.component \?\? ''/],
    'lib/canvas/draw-influence.ts': [/const q = plainSymbol\(il\.quantity\);/],
    'lib/viewport/draw-entities.ts': [/u03B4x=/, /u03B4z=/],
    'lib/viewport3d/free-body-3d.ts': [/push\('Rx'/, /push\('Fx'/],
    'lib/viewport3d/scene-sync.ts': [/\['dx', 'dy', 'dz'\] as const\)\.filter/],
    'lib/three/despiece-3d.ts': [/label: 'Fx', value: f\[0\]/],
    'lib/three/load-arrows-batched.ts': [/this\.format\.force\(f\.val\)/],
    'lib/engine/kinematic-report.ts': [/restrained: 'ux, uz/, /ROT3D_LABEL/, /DOF_LABEL_KEY\[ud\.dof\]/],
    'lib/engine/kinematic-2d.ts': [/DOF_LABEL_KEY\[d\.dof\]/],
    'components/EndConditionSelect.svelte': [/<option value=\{k\}>\{t\(END_KIND_LABEL\[k\]\)\}/],
    'components/floating-tools/ToolLoadOptions.svelte': [/title=\{t\('float\.loadGlobalYDir'\)\}>Z</],
    'lib/actions/influence-line.ts': [/toast\(t\('viewport\.ilClickHint'\)/],
    'lib/model/constraint-labels.ts': [/return DOF_LABELS\[d\] \?\? String\(d\)/],
  };
  for (const [f, forbidden] of Object.entries(seam)) {
    it(`${f} reads the user frame`, () => {
      const src = read(f);
      expect(src).toMatch(/axes\/(display|axes\.svelte|user-names|node-coords)'|from '\.\.\/axes\/|geometry\/coordinate-system'|kinematic-report'|edu-reactions'/);
      for (const re of forbidden) expect(src, `${f} ${re}`).not.toMatch(re);
    });
  }
});
