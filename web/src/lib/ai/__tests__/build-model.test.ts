/**
 * Integration tests for the AI build-model edit loop.
 *
 * Tests:
 * 1. buildModelContext produces correct shape from model data
 * 2. Empty canvas → build 3-story frame → snapshot has expected structure
 * 3. Existing model → "add one bay" → snapshot gains nodes/elements
 * 4. Existing model → "change all beams to IPE 300" → sections updated
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildModelContext, buildModel, type ModelContext, type ModelStoreView } from '../client';

// ─── Fixtures ──────────────────────────────────────────────────

/** 2-bay, 3-story frame: 4 columns x 4 rows = 16 nodes */
function makeMultiStoryStore(): ModelStoreView {
  const nodes = new Map<number, { id: number; x: number; y: number }>();
  const elements = new Map<number, { id: number; type: string }>();
  const sections = new Map<number, { id: number; name: string }>();
  const materials = new Map<number, { id: number; name: string }>();
  const supports = new Map<number, { id: number; type: string }>();
  const loads: unknown[] = [];

  // 3 columns (x=0, 6, 12) x 4 rows (y=0, 3, 6, 9)
  let nid = 1;
  for (const y of [0, 3, 6, 9]) {
    for (const x of [0, 6, 12]) {
      nodes.set(nid, { id: nid, x, y });
      nid++;
    }
  }

  // Columns (vertical elements) — 9 total
  let eid = 1;
  for (let col = 0; col < 3; col++) {
    for (let floor = 0; floor < 3; floor++) {
      const nI = floor * 3 + col + 1;
      const nJ = (floor + 1) * 3 + col + 1;
      elements.set(eid, { id: eid, type: 'frame' });
      eid++;
    }
  }
  // Beams (horizontal elements) — 6 total
  for (let floor = 1; floor <= 3; floor++) {
    for (let bay = 0; bay < 2; bay++) {
      const nI = floor * 3 + bay + 1;
      const nJ = floor * 3 + bay + 2;
      elements.set(eid, { id: eid, type: 'frame' });
      eid++;
    }
  }

  sections.set(1, { id: 1, name: 'IPE 300' });
  sections.set(2, { id: 2, name: 'HEB 300' });
  materials.set(1, { id: 1, name: 'Steel A36' });
  supports.set(1, { id: 1, type: 'fixed' });
  supports.set(2, { id: 2, type: 'fixed' });
  supports.set(3, { id: 3, type: 'fixed' });

  // 6 distributed loads on beams
  for (let i = 0; i < 6; i++) {
    loads.push({ type: 'distributed', data: { id: i + 1, elementId: 10 + i, qI: -10, qJ: -10 } });
  }

  return { nodes, elements, sections, materials, supports, loads };
}

/** Simple beam: 2 nodes, 1 element */
function makeBeamStore(): ModelStoreView {
  return {
    nodes: new Map([
      [1, { id: 1, x: 0, y: 0 }],
      [2, { id: 2, x: 6, y: 0 }],
    ]),
    elements: new Map([
      [1, { id: 1, type: 'frame' }],
    ]),
    sections: new Map([[1, { id: 1, name: 'IPE 300' }]]),
    materials: new Map([[1, { id: 1, name: 'Steel A36' }]]),
    supports: new Map([
      [1, { id: 1, type: 'pinned' }],
      [2, { id: 2, type: 'rollerX' }],
    ]),
    loads: [{ type: 'distributed', data: { id: 1, elementId: 1, qI: -10, qJ: -10 } }],
  };
}

// ─── Tests ─────────────────────────────────────────────────────

describe('buildModelContext', () => {
  it('produces correct context from multi-story frame', () => {
    const ctx = buildModelContext(makeMultiStoryStore());

    expect(ctx.nodeCount).toBe(12);
    expect(ctx.elementCount).toBe(15);
    expect(ctx.supportCount).toBe(3);
    expect(ctx.loadCount).toBe(6);

    expect(ctx.bounds).toEqual({ xMin: 0, xMax: 12, zMin: 0, zMax: 9 });
    expect(ctx.verticalAxis).toBe('z');
    expect(ctx.sections).toEqual([
      { id: 1, name: 'IPE 300' },
      { id: 2, name: 'HEB 300' },
    ]);
    expect(ctx.materials).toEqual([{ id: 1, name: 'Steel A36' }]);
    expect(ctx.supportTypes).toEqual(['fixed']);
    expect(ctx.elementTypes).toEqual(['frame']);

    // Floor heights: y=0,3,6,9 all have 3 nodes each (≥2)
    expect(ctx.floorHeights).toEqual([0, 3, 6, 9]);
    // Bay widths: x=0,6,12 → [6, 6]
    expect(ctx.bayWidths).toEqual([6, 6]);
  });

  it('produces correct context from simple beam', () => {
    const ctx = buildModelContext(makeBeamStore());

    expect(ctx.nodeCount).toBe(2);
    expect(ctx.elementCount).toBe(1);
    expect(ctx.bounds).toEqual({ xMin: 0, xMax: 6, zMin: 0, zMax: 0 });
    expect(ctx.verticalAxis).toBe('z');
    expect(ctx.supportTypes).toContain('pinned');
    expect(ctx.supportTypes).toContain('rollerX');
    // y=0 has 2 nodes → floor height detected
    expect(ctx.floorHeights).toEqual([0]);
    expect(ctx.bayWidths).toEqual([6]);
  });

  it('handles empty model gracefully', () => {
    const empty: ModelStoreView = {
      nodes: new Map(),
      elements: new Map(),
      sections: new Map(),
      materials: new Map(),
      supports: new Map(),
      loads: [],
    };
    const ctx = buildModelContext(empty);

    expect(ctx.nodeCount).toBe(0);
    expect(ctx.elementCount).toBe(0);
    expect(ctx.bounds.xMin).toBe(Infinity);
    expect(ctx.verticalAxis).toBe('z');
    expect(ctx.floorHeights).toEqual([]);
    expect(ctx.bayWidths).toEqual([]);
  });

  it('uses Z as elevation for 3D model context', () => {
    const store: ModelStoreView = {
      nodes: new Map([
        [1, { id: 1, x: 0, y: 0, z: 0 }],
        [2, { id: 2, x: 6, y: 0, z: 0 }],
        [3, { id: 3, x: 0, y: 4, z: 3 }],
        [4, { id: 4, x: 6, y: 4, z: 3 }],
      ]),
      elements: new Map([[1, { id: 1, type: 'frame' }]]),
      sections: new Map(),
      materials: new Map(),
      supports: new Map(),
      loads: [],
    };

    const ctx = buildModelContext(store);

    expect(ctx.bounds).toEqual({ xMin: 0, xMax: 6, zMin: 0, zMax: 3, yMin: 0, yMax: 4 });
    expect(ctx.verticalAxis).toBe('z');
    expect(ctx.floorHeights).toEqual([0, 3]);
  });

  it('preserves the backend Z-up contract for a 3D snapshot-derived store', () => {
    const backendStyleStore: ModelStoreView = {
      nodes: new Map([
        [1, { id: 1, x: 0, y: 0, z: 0 }],
        [2, { id: 2, x: 6, y: 0, z: 0 }],
        [3, { id: 3, x: 0, y: 5, z: 0 }],
        [4, { id: 4, x: 6, y: 5, z: 0 }],
        [5, { id: 5, x: 0, y: 0, z: 3 }],
        [6, { id: 6, x: 6, y: 0, z: 3 }],
        [7, { id: 7, x: 0, y: 5, z: 3 }],
        [8, { id: 8, x: 6, y: 5, z: 3 }],
      ]),
      elements: new Map([
        [1, { id: 1, type: 'frame' }],
        [2, { id: 2, type: 'frame' }],
      ]),
      sections: new Map([[1, { id: 1, name: 'IPE 300' }]]),
      materials: new Map([[1, { id: 1, name: 'Steel A36' }]]),
      supports: new Map([
        [1, { id: 1, type: 'fixed3d' }],
        [2, { id: 2, type: 'fixed3d' }],
      ]),
      loads: [],
    };

    const ctx = buildModelContext(backendStyleStore);

    expect(ctx.verticalAxis).toBe('z');
    expect(ctx.floorHeights).toEqual([0, 3]);
    expect(ctx.bounds).toEqual({ xMin: 0, xMax: 6, zMin: 0, zMax: 3, yMin: 0, yMax: 5 });
  });
});

// ─── buildModel integration (mocked fetch) ─────────────────────

// Mock 3-story frame snapshot as returned by backend
function make3StorySnapshot() {
  const nodes: Array<[number, { id: number; x: number; y: number }]> = [];
  let nid = 1;
  for (const y of [0, 3, 6, 9]) {
    for (const x of [0, 6, 12]) {
      nodes.push([nid, { id: nid, x, y }]);
      nid++;
    }
  }
  return {
    analysisMode: '2d',
    nodes,
    materials: [[1, { id: 1, name: 'Steel A36', e: 200000, nu: 0.3, rho: 78.5, fy: 250 }]],
    sections: [[1, { id: 1, name: 'IPE 300', a: 0.00538, iz: 8.356e-5 }]],
    elements: Array.from({ length: 15 }, (_, i) => [i + 1, { id: i + 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]),
    supports: [[1, { id: 1, nodeId: 1, type: 'fixed' }], [2, { id: 2, nodeId: 4, type: 'fixed' }], [3, { id: 3, nodeId: 7, type: 'fixed' }]],
    loads: [],
    nextId: { node: 13, material: 2, section: 2, element: 16, support: 4, load: 1 },
  };
}

// Snapshot after "add one bay" — 4 more nodes, 4 more elements
function makeSnapshotAfterAddBay() {
  const base = make3StorySnapshot();
  // Add 4 nodes at x=18
  for (const y of [0, 3, 6, 9]) {
    base.nodes.push([base.nextId.node, { id: base.nextId.node, x: 18, y }]);
    base.nextId.node++;
  }
  // Add 4 elements (3 columns + 1 beam approx)
  for (let i = 0; i < 4; i++) {
    base.elements.push([base.nextId.element, { id: base.nextId.element, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]);
    base.nextId.element++;
  }
  base.supports.push([4, { id: 4, nodeId: 13, type: 'fixed' }]);
  base.nextId.support = 5;
  return base;
}

describe('buildModel edit loop (mocked backend)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('step 1: empty canvas → build 3-story frame', async () => {
    const snapshot = make3StorySnapshot();
    const mockResp = {
      snapshot,
      message: '3-story frame with 2 bays',
      changeSummary: '3-story frame, 2 bays @ 6m x 3m',
      meta: { modelUsed: 'gpt-4o', inputTokens: 100, outputTokens: 200, latencyMs: 500, requestId: 'r1' },
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResp),
    }));

    const result = await buildModel('build a 3 story building', 'en', '2d');

    expect(result.snapshot).not.toBeNull();
    expect((result.snapshot!.nodes as unknown[]).length).toBe(12);
    expect(result.changeSummary).toContain('3-story');

    // Verify no modelContext/currentSnapshot was sent (empty canvas)
    const call = (fetch as any).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.modelContext).toBeUndefined();
    expect(body.currentSnapshot).toBeUndefined();
  });

  it('step 2: existing model → add one bay (sends context + snapshot)', async () => {
    const existingSnapshot = make3StorySnapshot();
    const afterBay = makeSnapshotAfterAddBay();
    const mockResp = {
      snapshot: afterBay,
      message: 'Added a bay on the right',
      changeSummary: 'Added bay 6m (right)',
      meta: { modelUsed: 'gpt-4o', inputTokens: 200, outputTokens: 300, latencyMs: 600, requestId: 'r2' },
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResp),
    }));

    // Build context from existing model
    const store = makeMultiStoryStore();
    const ctx = buildModelContext(store);

    const result = await buildModel('add one bay', 'en', '2d', ctx, existingSnapshot as any);

    expect(result.snapshot).not.toBeNull();
    // After adding bay: 12 + 4 = 16 nodes
    expect((result.snapshot!.nodes as unknown[]).length).toBe(16);
    expect(result.changeSummary).toContain('bay');

    // Verify modelContext and currentSnapshot WERE sent
    const call = (fetch as any).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.modelContext).toBeDefined();
    expect(body.modelContext.nodeCount).toBe(12);
    expect(body.modelContext.bounds.xMax).toBe(12);
    expect(body.modelContext.floorHeights).toEqual([0, 3, 6, 9]);
    expect(body.currentSnapshot).toBeDefined();
    expect(body.currentSnapshot.nodes.length).toBe(12);
  });

  it('step 3: existing model → change all beams to IPE 400', async () => {
    const snapshot = make3StorySnapshot();
    // Simulate backend changing section name
    (snapshot.sections as any) = [[1, { id: 1, name: 'IPE 400', a: 0.00845, iz: 2.313e-4 }]];

    const mockResp = {
      snapshot,
      message: 'Changed all beams to IPE 400',
      changeSummary: 'Changed all elements to IPE 400',
      meta: { modelUsed: 'gpt-4o', inputTokens: 150, outputTokens: 250, latencyMs: 400, requestId: 'r3' },
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResp),
    }));

    const store = makeMultiStoryStore();
    const ctx = buildModelContext(store);

    const result = await buildModel('change all beams to IPE 400', 'en', '2d', ctx, make3StorySnapshot() as any);

    expect(result.snapshot).not.toBeNull();
    const secs = result.snapshot!.sections as Array<[number, { name: string }]>;
    expect(secs[0][1].name).toBe('IPE 400');
    expect(result.changeSummary).toContain('IPE 400');
  });

  it('conversational reply does not include snapshot', async () => {
    const mockResp = {
      snapshot: null,
      message: 'Hello! I can help you build structures.',
      meta: { modelUsed: 'gpt-4o', inputTokens: 50, outputTokens: 80, latencyMs: 200, requestId: 'r4' },
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResp),
    }));

    const result = await buildModel('hi', 'en', '2d');
    expect(result.snapshot).toBeNull();
    expect(result.message).toContain('Hello');
  });
});
