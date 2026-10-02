import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import '../../store';
import { drawState, addShellOnCorners } from '../draw-state.svelte';

beforeEach(() => { modelStore.clear(); uiStore.cancelShellNodePick(); drawState.stop(); });

const square = () => [modelStore.addNode(0, 0, 0), modelStore.addNode(1, 0, 0), modelStore.addNode(1, 1, 0), modelStore.addNode(0, 1, 0)];
const mat = () => [...modelStore.materials.keys()][0]!;

describe('addShellOnCorners', () => {
  it('three corners make a triangle and four a quad', () => {
    const [a, b, c, d] = square();
    expect(addShellOnCorners([a!, b!, c!], mat(), 0.2)).toEqual({ key: expect.stringMatching(/^p\d+$/) });
    expect(addShellOnCorners([a!, b!, c!, d!], mat(), 0.2)).toEqual({ key: expect.stringMatching(/^q\d+$/) });
  });

  it('says what is wrong instead of adding', () => {
    const [a, b, c] = square();
    expect(addShellOnCorners([a!, b!], mat(), 0.2)).toEqual({ error: 'pro.shellNeedNodes' });
    expect(addShellOnCorners([a!, b!, 99], mat(), 0.2)).toEqual({ error: 'pro.errNodesExist' });
    expect(addShellOnCorners([a!, b!, b!], mat(), 0.2)).toEqual({ error: 'pro.errNodesDistinct' });
    expect(addShellOnCorners([a!, b!, c!], mat(), 0)).toEqual({ error: 'pro.errThickness' });
  });
});

describe('drawState', () => {
  it('in PRO, picking any tool ends a plate being drawn, and drawing a plate ends the tool', () => {
    const was = uiStore.analysisMode;
    uiStore.analysisMode = 'pro';
    uiStore.currentTool = 'element';
    drawState.startPlate();
    expect(uiStore.currentTool).toBe('select');
    expect(drawState.active).toBe(true);
    uiStore.currentTool = 'select';         // the ribbon's Select, or a stage command
    expect(drawState.active).toBe(false);
    expect(uiStore.shellNodePick.active).toBe(false);
    drawState.startPlate();
    uiStore.currentTool = 'node';           // another Draw button
    expect(uiStore.shellNodePick.active).toBe(false);
    expect(uiStore.currentTool).toBe('node');
    uiStore.currentTool = 'select';
    uiStore.analysisMode = was;
  });

  it('switching corner count keeps the picks that fit', () => {
    const [a, b] = square();
    drawState.plateCorners = 4;
    drawState.startPlate();
    for (const id of [a!, b!]) uiStore.pushShellNodePick(id);
    drawState.plateCorners = 3;
    expect(uiStore.shellNodePick.picked).toEqual([a, b]);
    expect(uiStore.shellNodePick.capacity).toBe(3);
  });

  it('three picked and "3 nodes" chosen makes the triangle and starts the next', () => {
    const [a, b, c] = square();
    drawState.plateCorners = 4;
    drawState.startPlate();
    for (const id of [a!, b!, c!]) uiStore.pushShellNodePick(id);
    drawState.plateCorners = 3;
    expect(modelStore.model.plates.size).toBe(1);
    expect(uiStore.shellNodePick).toMatchObject({ active: true, picked: [] });
  });

  it('writing and drawing exclude each other', () => {
    uiStore.currentTool = 'node';
    drawState.writing = 'node';
    expect(uiStore.currentTool).toBe('select');
    drawState.startPlate();
    expect(drawState.writing).toBeNull();
  });

  it('a drawn support is the draft: ticked is restrained, an elastic restraint is a spring', () => {
    const [a, b, c] = square();
    const d = drawState.support;
    expect(modelStore.supports.get(drawState.addSupportAt(a!))?.type).toBe('fixed3d');

    for (const k of ['rx', 'ry', 'rz'] as const) d.dofs[k] = false;
    expect(modelStore.supports.get(drawState.addSupportAt(b!))?.type).toBe('pinned3d');

    // Uz held by a 5000 kN/m spring; Ux and Uy rigid.
    d.elastic = true; d.springs.kz = 5000;
    const s = modelStore.supports.get(drawState.addSupportAt(c!))!;
    expect(s.type).toBe('custom3d');
    expect(s.dofRestraints).toMatchObject({ tx: true, ty: true, tz: false, rx: false });
    expect(s.kz).toBe(5000);
    expect(s.kx).toBeUndefined();

    d.elastic = false; d.springs.kz = undefined;
    for (const k of ['rx', 'ry', 'rz'] as const) d.dofs[k] = true;
  });
});
