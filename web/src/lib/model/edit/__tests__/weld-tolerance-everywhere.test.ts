/**
 * Every weld reads the one tolerance (`model/weld-tolerance.ts`): regenerating a structure, the
 * placement preview, the surface generator's own check, and the clean-up count. Each used to keep
 * a 0,1 mm of its own, so with the tolerance widened a node welded on one step and not the next.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import '../../../store';
import { placementStore } from '../../../store/placement.svelte';
import { generateStructure, DEFAULT_STRUCTURE_PARAMS } from '../../../engine/generators/structures';
import { emitModel, defaultProfileSpec, type EmitOptions } from '../../../engine/generators/emit';
import { insertGenerated, regenerate } from '../../../store/generated-structures';
import { translation } from '../affine';
import { detach, fragmentOf } from '../fragment';
import { insertFragment } from '../transformed-copy';
import { surfaceMesh } from '../surfaces';
import { zeroLengthMembers, removeZeroLengthMembers } from '../cleanup';
import { setWeldTolerance, DEFAULT_WELD_TOL } from '../../weld-tolerance';

beforeEach(() => { placementStore.cancel(); modelStore.clear(); historyStore.clear(); });
afterEach(() => { setWeldTolerance(DEFAULT_WELD_TOL); });

const near = (x: number, y: number, z: number, r: number) =>
  [...modelStore.nodes.values()].filter((n) => Math.hypot(n.x - x, n.y - y, (n.z ?? 0) - z) <= r).map((n) => n.id);

describe('the weld tolerance, everywhere a weld is made', () => {
  it('regenerating a structure keeps the weld its insertion made', () => {
    setWeldTolerance(0.005);
    // A neighbour's member ending 3 mm from where the frame's first column stands.
    const ext = modelStore.addNode(0.003, 0, 0);
    modelStore.addElement(ext, modelStore.addNode(-3, 0, 0), 'frame');
    const P = { chord: defaultProfileSpec('IPE 160'), post: defaultProfileSpec('L 50x50x5'), diagonal: defaultProfileSpec('L 50x50x5'),
      rafter: defaultProfileSpec('IPE 200'), column: defaultProfileSpec('HEB 200'), beam: defaultProfileSpec('IPE 240'),
      purlin: defaultProfileSpec('UPN 100'), bracing: defaultProfileSpec('L 50x50x5') } as EmitOptions['profiles'];
    const make = () => {
      const t = generateStructure('planeFrame', { ...DEFAULT_STRUCTURE_PARAMS.planeFrame, baysX: '6', storeys: '1' })!;
      return { g: emitModel(t, { name: 'P', profiles: P }), roles: t.members.map((m) => m.role) };
    };
    const meta = { generator: 'planeFrame', params: { baysX: '6' }, profiles: {}, gradeId: null, name: 'P' };
    const f = make();
    const r = insertGenerated(f.g, translation([0, 0, 0]), meta, f.roles);
    expect(near(0, 0, 0, 0.005)).toEqual([ext]);
    const f2 = make();
    regenerate(r.groupId, f2.g, meta, f2.roles);
    expect(near(0, 0, 0, 0.005)).toEqual([ext]);
  });

  it('the placement preview welds what the commit welds', () => {
    setWeldTolerance(0.01);
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    const frag = detach(fragmentOf({ nodes: [], elements: [e] }));
    placementStore.start({ fragment: frag, label: 'test' });
    placementStore.setTarget([4.004, 0, 0]);
    const preview = placementStore.mergePreview();
    const r = placementStore.commit()!;
    expect(r.welded).toBe(1);
    expect(preview.welds).toHaveLength(r.welded);
  });

  it('the surface generator refuses cells the insertion would weld shut', () => {
    setWeldTolerance(0.05);
    // 720 around a 0,5 m radius: 4,4 mm apart, inside a 50 mm weld.
    expect(surfaceMesh('cylinder', { radius: 0.5, height: 1, angle: 360, around: 720, along: 1 })).toBeNull();
  });

  it('an inserted shell whose corners weld together is left out, and said', () => {
    const c = [[0, 0], [0.003, 0], [0.003, 1], [0, 1]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
    const q = modelStore.addQuad(c as [number, number, number, number], 1, 0.1);
    const frag = detach(fragmentOf({ nodes: [], elements: [], quads: [q] }));
    modelStore.clear();
    setWeldTolerance(0.005);
    const r = insertFragment(frag, [translation([10, 0, 0])]);
    expect(r.quads).toEqual([]);
    expect(modelStore.quads.size).toBe(0);
    expect(r.warnings.shellCollapsed).toBe(1);
  });

  it('the clean-up counts the zero-length members it then removes', () => {
    setWeldTolerance(0.005);
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0.003, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    expect(zeroLengthMembers()).toEqual([e]);
    expect(removeZeroLengthMembers().removedZeroLength).toBe(1);
  });
});
