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

  it('a drawn support is the draft', () => {
    const [a] = square();
    drawState.support.type = 'pinned3d';
    const id = drawState.addSupportAt(a!);
    expect(modelStore.supports.get(id)?.type).toBe('pinned3d');
    drawState.support.type = 'fixed3d';
  });
});
