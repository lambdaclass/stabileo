import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import AxesFigure from '../AxesFigure.svelte';
import { allChoices, makeFrame, DEFAULT_AXES, plane2D } from '../../../lib/axes/frame';
import { axesStore } from '../../../lib/axes/axes.svelte';
import ToolLoadOptions from '../../floating-tools/ToolLoadOptions.svelte';
import { modelStore, uiStore } from '../../../lib/store';
import { buildWrittenLoads, blankWriteForm } from '../../../lib/model/loads/write-load';
import { typedFrame } from '../../../lib/axes/typed-frame';
import { memberRef3D } from '../../../lib/engine/solver-service';
import { addLoads } from '../../../lib/store/load-ops';

afterEach(() => axesStore.reset());

it('known wrong result: #1986 the positive moment sweep agrees with the axial direction', () => {
  for (const c of [DEFAULT_AXES, ...allChoices()]) {
    const f = makeFrame(c);
    const html = render(AxesFigure, { props: { frame: f, kind: 'plane' } }).body;
    const ccw = f.det * plane2D(f).normal.sign < 0;
    expect(html).toContain(ccw ? 'A28,28 0 1,0' : 'A28,28 0 1,1');
  }
});

it('reported #1986 gravity is parallel to physical down with every selected up name', () => {
  for (const c of allChoices()) {
    const html = render(AxesFigure, { props: { frame: makeFrame(c), kind: 'space' } }).body;
    expect(html).toContain('d="M160,13 L160,41"');
    expect(html).toContain(`g · ${c.up[0] === '+' ? '−' : '+'}${c.up[1]}`);
  }
});

it('reported #1986 distributed inputs are user signed and placement converts them', () => {
  axesStore.choice = { up: '-Y', right: '+X', hand: 'right' };
  uiStore.analysisMode = 'pro';
  uiStore.loadType = 'distributed';
  uiStore.distLoadFrame3D = 'global';
  uiStore.loadValueZ = 7;
  const html = render(ToolLoadOptions).body;
  expect(html).toContain('qYI:');
  modelStore.clear();
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
  const id = modelStore.addElement(a, b, 'frame');
  for (const frame of ['global', 'projected'] as const) {
    const form = blankWriteForm('distributed');
    form.frame = frame;
    form.q.yI = 7;
    const result = buildWrittenLoads(form, { caseId: 1, ids: [id], chain: false, node: n => modelStore.nodes.get(n), element: e => modelStore.elements.get(e), axes: e => memberRef3D(modelStore.model as never, e)?.axes ?? null, length: e => modelStore.getElementLength(e), toModel: typedFrame });
    expect('error' in result).toBe(false);
    if ('error' in result) throw new Error(result.error);
    expect(result.loads).toHaveLength(1);
    const before = modelStore.loads.length;
    addLoads(result.loads);
    expect(modelStore.loads).toHaveLength(before + 1);
    expect(modelStore.loads.at(-1)).toMatchObject({ type: 'distributed3d', data: { elementId: id, frame, qZI: -7, qZJ: -7 } });
  }
  modelStore.clear();
});
