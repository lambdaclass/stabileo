/**
 * Load a JSON fixture into the model store via the ExampleAPI.
 *
 * This is the single source of truth for example model loading.
 * Both the app (via ExampleAPI) and tests (via buildSolverInput3D) can
 * consume the same JSON files, eliminating mock divergence.
 */

export interface JSONModel {
  name: string;
  materials: Array<{ id: number; [k: string]: unknown }>;
  sections: Array<{ id: number; [k: string]: unknown }>;
  nodes: Array<{ id: number; x: number; y: number; z: number }>;
  elements: Array<{
    id: number;
    type: 'frame' | 'truss';
    nodeI: number;
    nodeJ: number;
    materialId: number;
    sectionId: number;
    hingeStart: boolean;
    hingeEnd: boolean;
  }>;
  supports: Array<{ id: number; nodeId: number; type: string; [k: string]: unknown }>;
  loads: Array<{ type: string; data: Record<string, unknown> }>;
  plates: Array<{ id: number; nodes: number[]; materialId: number; thickness: number }>;
  quads: Array<{ id: number; nodes: number[]; materialId: number; thickness: number }>;
  constraints: Array<Record<string, unknown>>;
  loadCases: Array<{ id: number; type: string; name: string }>;
  combinations: Array<{ id: number; name: string; factors: Array<{ caseId: number; factor: number }> }>;
}

/**
 * Minimal API surface needed to load a fixture into any target
 * (model store, test mock, or solver input builder).
 */
export interface FixtureLoader {
  addNode(x: number, y: number, z?: number): number;
  addElement(nI: number, nJ: number, type?: 'frame' | 'truss'): number;
  addSupport(nodeId: number, type: string, springK?: Record<string, number>, opts?: Record<string, unknown>): number;
  updateSupport?(id: number, data: Record<string, unknown>): void;
  addMaterial(data: Omit<Record<string, unknown>, 'id'>): number;
  addSection(data: Omit<Record<string, unknown>, 'id'>): number;
  updateElementMaterial(elemId: number, matId: number): void;
  updateElementSection(elemId: number, secId: number): void;
  // 2D loads
  addDistributedLoad?(elemId: number, qI: number, qJ?: number, angle?: number, isGlobal?: boolean, caseId?: number): number;
  addNodalLoad?(nodeId: number, fx: number, fy: number, mz?: number, caseId?: number): number;
  addPointLoadOnElement?(elementId: number, a: number, p: number, opts?: Record<string, unknown>): number;
  addThermalLoad?(elemId: number, dtUniform: number, dtGradient: number): number;
  toggleHinge?(elemId: number, end: 'start' | 'end'): void;
  // 3D loads
  addDistributedLoad3D?(elemId: number, qYI: number, qYJ: number, qZI: number, qZJ: number, a?: number, b?: number, caseId?: number): number;
  addNodalLoad3D?(nodeId: number, fx: number, fy: number, fz: number, mx: number, my: number, mz: number, caseId?: number): number;
  addSurfaceLoad3D?(quadId: number, q: number, caseId?: number): number;
  // Shell elements
  addPlate?(nodes: number[], materialId: number, thickness: number): number;
  addQuad?(nodes: number[], materialId: number, thickness: number): number;
  // Constraints
  addConstraint?(c: Record<string, unknown>): void;
  // Model metadata
  model: { name: string; loadCases: Array<{ id: number; type: string; name: string }>; combinations: Array<Record<string, unknown>> };
  nextId: { loadCase: number; combination: number };
}

/**
 * Load a JSON fixture into the given API target.
 * Replays all the creation calls in the correct order:
 * materials → sections → nodes → elements → supports → loads → shells → constraints
 */
export function loadFixture(json: JSONModel, api: FixtureLoader): void {
  api.model.name = json.name;

  // ID remapping: fixture IDs may not match the auto-increment IDs from the API
  const nodeMap = new Map<number, number>();
  const elemMap = new Map<number, number>();
  const matMap = new Map<number, number>();
  const secMap = new Map<number, number>();
  const quadMap = new Map<number, number>();

  // Materials (skip id=1, it's the default — but update it if fixture overrides)
  for (const mat of json.materials) {
    if (mat.id === 1) {
      // Update default material in place via addMaterial trick:
      // Just map 1→1 and let the store keep its default
      // But we need the fixture's properties. Use addMaterial for id>1.
      matMap.set(1, 1);
      // The default material may have different properties; override by adding a new one
      // and remapping. But most stores don't support updateMaterial via ExampleAPI.
      // Since loadFixture is called after clear(), the default mat is Acero A36.
      // If fixture has a different material at id=1, add it as a new one.
      const defaultE = 200000;
      if (mat.e !== defaultE || mat.name !== 'Acero A36') {
        const newId = api.addMaterial(withoutId(mat));
        matMap.set(1, newId);
      }
    } else {
      const newId = api.addMaterial(withoutId(mat));
      matMap.set(mat.id, newId);
    }
  }

  // Sections (skip id=1 default — update if fixture overrides)
  for (const sec of json.sections) {
    if (sec.id === 1) {
      secMap.set(1, 1);
      const defaultName = 'IPN 300';
      if (sec.name !== defaultName) {
        const newId = api.addSection(withoutId(sec));
        secMap.set(1, newId);
      }
    } else {
      const newId = api.addSection(withoutId(sec));
      secMap.set(sec.id, newId);
    }
  }

  // Nodes
  for (const n of json.nodes) {
    const newId = api.addNode(n.x, n.y, n.z);
    nodeMap.set(n.id, newId);
  }

  // Elements
  for (const e of json.elements) {
    const nI = nodeMap.get(e.nodeI)!;
    const nJ = nodeMap.get(e.nodeJ)!;
    const newId = api.addElement(nI, nJ, e.type);
    elemMap.set(e.id, newId);

    // Remap material and section
    const matId = matMap.get(e.materialId) ?? e.materialId;
    const secId = secMap.get(e.sectionId) ?? e.sectionId;
    if (matId !== 1) api.updateElementMaterial(newId, matId);
    if (secId !== 1) api.updateElementSection(newId, secId);

    // Hinges
    if (e.hingeStart && api.toggleHinge) api.toggleHinge(newId, 'start');
    if (e.hingeEnd && api.toggleHinge) api.toggleHinge(newId, 'end');
  }

  // Supports
  for (const s of json.supports) {
    const nodeId = nodeMap.get(s.nodeId)!;
    const { id: _id, nodeId: _nid, type, ...rest } = s;
    api.addSupport(nodeId, type, rest as any);
  }

  // Loads
  for (const load of json.loads) {
    const d = load.data;
    switch (load.type) {
      case 'distributed': {
        api.addDistributedLoad?.(
          elemMap.get(d.elementId as number)!, d.qI as number, d.qJ as number,
          d.angle as number | undefined, d.isGlobal as boolean | undefined, d.caseId as number | undefined,
        );
        break;
      }
      case 'nodal': {
        api.addNodalLoad?.(
          nodeMap.get(d.nodeId as number)!,
          d.fx as number,
          d.fz as number,
          d.my as number | undefined,
          d.caseId as number | undefined,
        );
        break;
      }
      case 'pointOnElement': {
        const { elementId, a, p, ...opts } = d;
        api.addPointLoadOnElement?.(elemMap.get(elementId as number)!, a as number, p as number, opts);
        break;
      }
      case 'thermal': {
        api.addThermalLoad?.(elemMap.get(d.elementId as number)!, d.dtUniform as number, d.dtGradient as number);
        break;
      }
      case 'distributed3d': {
        api.addDistributedLoad3D?.(
          elemMap.get(d.elementId as number)!, d.qYI as number, d.qYJ as number,
          d.qZI as number, d.qZJ as number, d.a as number | undefined,
          d.b as number | undefined, d.caseId as number | undefined,
        );
        break;
      }
      case 'nodal3d': {
        api.addNodalLoad3D?.(
          nodeMap.get(d.nodeId as number)!, d.fx as number, d.fy as number,
          d.fz as number, d.mx as number, d.my as number, d.mz as number,
          d.caseId as number | undefined,
        );
        break;
      }
      case 'surface3d': {
        const qId = quadMap.get(d.quadId as number) ?? d.quadId as number;
        api.addSurfaceLoad3D?.(qId, d.q as number, d.caseId as number | undefined);
        break;
      }
    }
  }

  // Plates
  for (const p of json.plates) {
    const mappedNodes = p.nodes.map(n => nodeMap.get(n)!);
    const matId = matMap.get(p.materialId) ?? p.materialId;
    api.addPlate?.(mappedNodes, matId, p.thickness);
  }

  // Quads
  for (const q of json.quads) {
    const mappedNodes = q.nodes.map(n => nodeMap.get(n)!);
    const matId = matMap.get(q.materialId) ?? q.materialId;
    const newId = api.addQuad?.(mappedNodes, matId, q.thickness);
    if (newId != null) quadMap.set(q.id, newId);
  }

  // Constraints
  for (const c of json.constraints) {
    // Remap node IDs in constraints
    const mapped = { ...c };
    if (typeof mapped.masterNode === 'number') mapped.masterNode = nodeMap.get(mapped.masterNode as number) ?? mapped.masterNode;
    if (Array.isArray(mapped.slaveNodes)) mapped.slaveNodes = (mapped.slaveNodes as number[]).map(n => nodeMap.get(n) ?? n);
    if (typeof mapped.nodeI === 'number') mapped.nodeI = nodeMap.get(mapped.nodeI as number) ?? mapped.nodeI;
    if (typeof mapped.nodeJ === 'number') mapped.nodeJ = nodeMap.get(mapped.nodeJ as number) ?? mapped.nodeJ;
    if (Array.isArray(mapped.nodes)) mapped.nodes = (mapped.nodes as number[]).map(n => nodeMap.get(n) ?? n);
    api.addConstraint?.(mapped);
  }

  // Load cases & combinations
  if (json.loadCases.length > 0) {
    api.model.loadCases = json.loadCases as any;
    api.nextId.loadCase = Math.max(...json.loadCases.map(lc => lc.id)) + 1;
  }
  if (json.combinations.length > 0) {
    api.model.combinations = json.combinations as any;
    api.nextId.combination = Math.max(...json.combinations.map(c => c.id)) + 1;
  }
}

function withoutId(obj: Record<string, unknown>): Record<string, unknown> {
  const { id: _, ...rest } = obj;
  return rest;
}
