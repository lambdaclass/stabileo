/**
 * Duplicate-node prevention: a path that wants "a node here" welds to the one
 * already there instead of stacking a twin that looks joined and analyses as a
 * cut, with no visible symptom.
 *
 * Pinned here:
 *  - `subdivideElement` reuses a node at the cut — the midpoint a secondary
 *    frames into — instead of leaving the girder on a new twin;
 *  - `addNodeWelded`, the one canonical weld interactive entry points use,
 *    reuses within the weld tolerance and creates beyond it, and a weld is not
 *    an undo step;
 *  - `checkModel` flags coincidence at the same tolerance the clean-up merges
 *    at, so every finding the Fix button can clear, and legitimate close nodes
 *    are not flagged.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import { checkCurrentModel } from '../../engine/solve-diagnostics';
import { mergeCoincidentNodes } from '../../model/edit/cleanup';
import { uiStore } from '../ui.svelte';
import '../index';

beforeAll(async () => {
  // The history store wires itself into the model store on a microtask.
  await new Promise((r) => setTimeout(r, 0));
});

beforeEach(() => {
  modelStore.clear();
  historyStore.clear();
});

const codes = () => new Set(checkCurrentModel().map((d) => d.code));

describe('subdivideElement welds the cut', () => {
  it.each([[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1]])(
    'keeps dense cuts distinct along (%s, %s, %s), reusing an exact midpoint', (x, y, z) => {
      const a = modelStore.addNode(0, 0, 0);
      const b = modelStore.addNode(x * 0.0015, y * 0.0015, z * 0.0015);
      const midpoint = modelStore.addNode(x * 0.00075, y * 0.00075, z * 0.00075);
      const element = modelStore.addElement(a, b);
      modelStore.addDistributedLoad(element, -10, -10);
      historyStore.clear();

      const check = () => {
        expect(modelStore.nodes.size).toBe(21);
        expect(modelStore.elements.size).toBe(20);
        const members = [...modelStore.elements.values()];
        expect(members.filter(e => e.nodeI === midpoint || e.nodeJ === midpoint)).toHaveLength(2);
        const length = Math.hypot(x, y, z) * 0.0015 / 20;
        for (const e of members) {
          expect(e.nodeI).not.toBe(e.nodeJ);
          const ni = modelStore.nodes.get(e.nodeI)!, nj = modelStore.nodes.get(e.nodeJ)!;
          expect(Math.hypot(nj.x - ni.x, nj.y - ni.y, (nj.z ?? 0) - (ni.z ?? 0))).toBeCloseTo(length, 12);
        }
        expect(modelStore.loads).toHaveLength(20);
        for (const load of modelStore.loads) expect(load.data).toMatchObject({ qI: -10, qJ: -10 });
      };
      modelStore.subdivideElement(element, 20);
      check();
      expect(historyStore.undoCount).toBe(1);
      historyStore.undo();
      expect(modelStore.elements.size).toBe(1);
      expect(modelStore.nodes.size).toBe(3);
      expect(modelStore.loads).toHaveLength(1);
      historyStore.redo();
      check();
    },
  );

  it('a girder subdivided where a secondary frames in keeps the shared node', () => {
    const a = modelStore.addNode(0, 0, 0);
    const b = modelStore.addNode(6, 0, 0);
    const girder = modelStore.addElement(a, b, 'frame');
    const mid = modelStore.addNode(3, 0, 0);
    const c = modelStore.addNode(3, 3, 0);
    const secondary = modelStore.addElement(mid, c, 'frame');
    historyStore.clear();

    modelStore.subdivideElement(girder, 2);

    // No twin at the midpoint, and the girder's segments land on the
    // secondary's node: connected, not coincident.
    expect(modelStore.nodes.size).toBe(4);
    const spans = [...modelStore.elements.values()]
      .filter((e) => e.id !== secondary)
      .map((e) => [e.nodeI, e.nodeJ].sort((x, y) => x - y).join('-'))
      .sort();
    const pair = (x: number, y: number) => [x, y].sort((p, q) => p - q).join('-');
    expect(spans).toEqual([pair(a, mid), pair(mid, b)].sort());
    expect(modelStore.elements.get(secondary)!.nodeI).toBe(mid);
    // One command, one undo step.
    expect(historyStore.undoCount).toBe(1);
  });

  it('still creates the cut nodes where nothing frames in', () => {
    const a = modelStore.addNode(0, 0, 0);
    const b = modelStore.addNode(6, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.subdivideElement(e, 3);
    expect(modelStore.nodes.size).toBe(4);
    expect(modelStore.elements.size).toBe(3);
  });
});

describe('addNodeWelded', () => {
  it('returns the node already at the position, and creates one past the tolerance', () => {
    const a = modelStore.addNode(1, 2, 3);
    expect(modelStore.addNodeWelded(1, 2, 3)).toBe(a);
    expect(modelStore.addNodeWelded(1 + 5e-5, 2, 3)).toBe(a); // within 1e-4
    const b = modelStore.addNodeWelded(1 + 5e-4, 2, 3); // beyond it
    expect(b).not.toBe(a);
    expect(modelStore.nodes.size).toBe(2);
  });

  it('a weld is not an undo step — nothing changed', () => {
    const a = modelStore.addNode(0, 0, 0);
    historyStore.clear();
    expect(modelStore.addNodeWelded(0, 0, 0)).toBe(a);
    expect(historyStore.undoCount).toBe(0);
  });
});

describe('detection and repair use one tolerance', () => {
  it('a coincident pair is flagged, and the merge clears the finding', () => {
    const a = modelStore.addNode(0, 0, 0);
    const b = modelStore.addNode(0, 0, 5e-5);
    expect(codes().has('MODEL_COINCIDENT_NODES')).toBe(true);
    mergeCoincidentNodes();
    expect(modelStore.nodes.has(b)).toBe(false);
    expect(modelStore.nodes.has(a)).toBe(true);
    expect(codes().has('MODEL_COINCIDENT_NODES')).toBe(false);
  });

  it('close-but-legitimate nodes the clean-up cannot merge are not flagged', () => {
    modelStore.addNode(0, 0, 0);
    modelStore.addNode(0, 0, 5e-4); // 0.5 mm apart: beyond the weld tolerance
    expect(codes().has('MODEL_COINCIDENT_NODES')).toBe(false);
  });
});

describe('review of the welds', () => {
  it('a plane model standing in 3D: a typed point welds where the node is shown', async () => {
    uiStore.analysisMode = '2d';
    modelStore.clear();
    await modelStore.loadExample('portal-frame');
    uiStore.analysisMode = '3d';
    expect(uiStore.viewportPresentation3D).toBe('upright2dIn3d');
    // Stored in plane coordinates, height in y; shown standing, height in z.
    const top = [...modelStore.nodes.values()].sort((p, q) => q.y - p.y || p.x - q.x)[0]!;
    const count = modelStore.nodes.size;
    expect(modelStore.addNodeWelded(top.x, 0, top.y)).toBe(top.id);
    expect(modelStore.nodes.size).toBe(count);
  });

  it('points that all weld make no undo step, one by one or as a batch', () => {
    modelStore.addNode(0, 0, 0);
    modelStore.addNode(1, 0, 0);
    historyStore.clear();
    expect(modelStore.addNodesWelded([[0, 0, 0], [1, 0, 0]]).created).toEqual([]);
    expect(historyStore.undoCount).toBe(0);
  });

  it('a long model is flagged at least as widely as the engine gate, so the two findings are one', () => {
    // 200 m: the engine's near-duplicate gate is 1e-6·L = 0,2 mm; these are 0,15 mm apart.
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(200, 0, 0);
    modelStore.addElement(a, b, 'frame');
    modelStore.addNode(100, 0, 0);
    modelStore.addNode(100.00015, 0, 0);
    expect(codes().has('MODEL_COINCIDENT_NODES')).toBe(true);
  });
});

describe('the fallback paste goes through insertFragment', () => {
  it('pasting the same record twice lands on the first paste: no second member on its nodes', async () => {
    const { pasteClipboardRecord } = await import('../clipboard-paste');
    const clip = {
      nodes: [{ origId: 1, x: 0, y: 0 }, { origId: 2, x: 4, y: 0 }],
      elements: [{ origNodeI: 1, origNodeJ: 2, type: 'frame' as const, materialId: 1, sectionId: 1 }],
      supports: [{ origNodeId: 1, type: 'pinned' as const }],
    };
    const first = pasteClipboardRecord(clip as never, [1, 1, 0]);
    expect(first.elements).toHaveLength(1);
    const second = pasteClipboardRecord(clip as never, [1, 1, 0]);
    expect(second.elements).toEqual([]);
    expect(second.duplicates).toBe(1);
    expect(modelStore.elements.size).toBe(1);
    expect(modelStore.nodes.size).toBe(2);
    expect(modelStore.supports.size).toBe(1);
  });
});

describe('the fallback paste carries the member frame', () => {
  it('a complete local axis and a roll come back; an incomplete axis is not taken for one', async () => {
    const { pasteClipboardRecord } = await import('../clipboard-paste');
    const clip = {
      nodes: [{ origId: 1, x: 0, y: 0, z: 0 }, { origId: 2, x: 4, y: 0, z: 0 }, { origId: 3, x: 0, y: 3, z: 0 }],
      elements: [
        { origNodeI: 1, origNodeJ: 2, type: 'frame' as const, materialId: 1, sectionId: 1, localYx: 0, localYy: 0, localYz: 1, rollAngle: 30 },
        { origNodeI: 1, origNodeJ: 3, type: 'frame' as const, materialId: 1, sectionId: 1, localYx: 1 },
      ],
      supports: [],
    };
    const r = pasteClipboardRecord(clip as never, [0, 0, 3]);
    const [full, partial] = r.elements.map((id) => modelStore.elements.get(id)!);
    expect([full!.localYx, full!.localYy, full!.localYz]).toEqual([0, 0, 1]);
    expect(full!.rollAngle).toBeCloseTo(30, 12);
    // Only localYx: not an axis. The member keeps its own default one.
    const { computeLocalAxes3D } = await import('../../engine/local-axes-3d');
    const ni = modelStore.nodes.get(partial!.nodeI)!, nj = modelStore.nodes.get(partial!.nodeJ)!;
    const auto = computeLocalAxes3D({ id: 0, x: ni.x, y: ni.y, z: ni.z ?? 0 }, { id: 0, x: nj.x, y: nj.y, z: nj.z ?? 0 }).ey;
    const ey = partial!.localYx === undefined ? auto : [partial!.localYx, partial!.localYy!, partial!.localYz!];
    ey.forEach((v, k) => expect(v).toBeCloseTo(auto[k]!, 12));
  });
});

describe('addNodesWelded', () => {
  it('reuses nodes there, shares one node between repeated points, and makes no step when all weld', () => {
    const a = modelStore.addNode(0, 0, 0);
    historyStore.clear();
    const r = modelStore.addNodesWelded([[0, 0, 0], [3, 0, 0], [3, 0, 0], [0, 0, 5e-5]]);
    expect(r.created).toHaveLength(1);
    expect(r.ids).toEqual([a, r.created[0], r.created[0], a]);
    expect(historyStore.undoCount).toBe(1);
    expect(modelStore.addNodesWelded([[0, 0, 0], [3, 0, 0]]).created).toEqual([]);
    expect(historyStore.undoCount).toBe(1);
  });
});
