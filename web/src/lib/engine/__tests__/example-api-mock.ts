/**
 * Mock ExampleAPI3D — builds a ModelData object in memory without Svelte reactivity.
 * Used by fixture generation tests to load example models through the same path
 * the real app takes (example loader → ModelData → buildSolverInput2D/3D).
 */

import type { ExampleAPI3D } from '../../../lib/store/model-examples-3d';
import type { ModelData } from '../solver-service';
import type {
  Node, Element, Support, Load, Material, Section, SupportType,
  NodalLoad, DistributedLoad, PointLoadOnElement, ThermalLoad,
  NodalLoad3D, DistributedLoad3D,
  LoadCase, LoadCombination,
} from '../../../lib/store/model.svelte';

/** Default steel material: E=200GPa, ν=0.3, ρ=78.5 kN/m³ */
const DEFAULT_MATERIAL: Omit<Material, 'id'> = {
  name: 'Steel', e: 200000, nu: 0.3, rho: 78.5,
};

/** Default section: a=0.01 m², iz=0.0001 m⁴, iy=0.0001 m⁴, j=0.0002 m⁴ */
const DEFAULT_SECTION: Omit<Section, 'id'> = {
  name: 'Default', a: 0.01, iz: 0.0001, iy: 0.0001, j: 0.0002,
};

export interface MockAPIResult extends ExampleAPI3D {
  getModelData(): ModelData;
  model: { name: string; loadCases: LoadCase[]; combinations: LoadCombination[] };
  nextId: { loadCase: number; combination: number };
}

export function createMockAPI(): MockAPIResult {
  let nextNodeId = 1;
  let nextElemId = 1;
  let nextSupId = 1;
  let nextLoadId = 1;
  let nextMatId = 1;
  let nextSecId = 1;

  const nodes = new Map<number, Node>();
  const elements = new Map<number, Element>();
  const supports = new Map<number, Support>();
  const loads: Load[] = [];
  const materials = new Map<number, Material>();
  const sections = new Map<number, Section>();

  // Add default material and section (ID 1)
  materials.set(1, { id: 1, ...DEFAULT_MATERIAL });
  sections.set(1, { id: 1, ...DEFAULT_SECTION });
  nextMatId = 2;
  nextSecId = 2;

  const modelMeta = {
    name: '',
    loadCases: [] as LoadCase[],
    combinations: [] as LoadCombination[],
  };
  const nextIdMeta = { loadCase: 1, combination: 1 };

  const api: MockAPIResult = {
    model: modelMeta,
    nextId: nextIdMeta,

    addNode(x: number, y: number, z?: number): number {
      const id = nextNodeId++;
      const node: Node = { id, x, y };
      if (z !== undefined && z !== 0) node.z = z;
      nodes.set(id, node);
      return id;
    },

    addElement(nI: number, nJ: number, type: 'frame' | 'truss' = 'frame'): number {
      const id = nextElemId++;
      elements.set(id, {
        id, type, nodeI: nI, nodeJ: nJ,
        materialId: 1, sectionId: 1,
        hingeStart: false, hingeEnd: false,
      });
      return id;
    },

    addSupport(nodeId: number, type: SupportType, springs?: { kx?: number; ky?: number; kz?: number }, opts?: { angle?: number }): number {
      // Remove existing support on this node
      for (const [existingId, existingSup] of supports) {
        if (existingSup.nodeId === nodeId) {
          supports.delete(existingId);
          break;
        }
      }
      const id = nextSupId++;
      const sup: Support = { id, nodeId, type };
      if (springs) {
        if (springs.kx !== undefined) sup.kx = springs.kx;
        if (springs.ky !== undefined) sup.ky = springs.ky;
        if (springs.kz !== undefined) sup.kz = springs.kz;
      }
      if (opts?.angle !== undefined && opts.angle !== 0) sup.angle = opts.angle;
      supports.set(id, sup);
      return id;
    },

    updateSupport(id: number, data: Record<string, unknown>): void {
      const sup = supports.get(id);
      if (!sup) return;
      supports.set(id, { ...sup, ...data } as Support);
    },

    addMaterial(data: Omit<Material, 'id'>): number {
      const id = nextMatId++;
      materials.set(id, { id, ...data });
      return id;
    },

    addSection(data: Omit<Section, 'id'>): number {
      const id = nextSecId++;
      sections.set(id, { id, ...data });
      return id;
    },

    updateElementMaterial(elemId: number, matId: number): void {
      const elem = elements.get(elemId);
      if (elem) elements.set(elemId, { ...elem, materialId: matId });
    },

    updateElementSection(elemId: number, secId: number): void {
      const elem = elements.get(elemId);
      if (elem) elements.set(elemId, { ...elem, sectionId: secId });
    },

    addDistributedLoad(elementId: number, qI: number, qJ?: number, angle?: number, isGlobal?: boolean, caseId?: number): number {
      const id = nextLoadId++;
      const data: DistributedLoad = { id, elementId, qI, qJ: qJ ?? qI };
      if (angle !== undefined && angle !== 0) data.angle = angle;
      if (isGlobal) data.isGlobal = true;
      if (caseId !== undefined) data.caseId = caseId;
      loads.push({ type: 'distributed', data });
      return id;
    },

    addNodalLoad(nodeId: number, fx: number, fy: number, mz: number = 0, caseId?: number): number {
      const id = nextLoadId++;
      const data: NodalLoad = { id, nodeId, fx, fy, mz };
      if (caseId !== undefined) data.caseId = caseId;
      loads.push({ type: 'nodal', data });
      return id;
    },

    addPointLoadOnElement(elementId: number, a: number, p: number, opts?: { px?: number; mz?: number; angle?: number; isGlobal?: boolean; caseId?: number }): number {
      const id = nextLoadId++;
      const data: PointLoadOnElement = { id, elementId, a, p };
      if (opts?.px !== undefined && opts.px !== 0) data.px = opts.px;
      if (opts?.mz !== undefined && opts.mz !== 0) data.mz = opts.mz;
      if (opts?.angle !== undefined && opts.angle !== 0) data.angle = opts.angle;
      if (opts?.isGlobal) data.isGlobal = true;
      if (opts?.caseId !== undefined) data.caseId = opts.caseId;
      loads.push({ type: 'pointOnElement', data });
      return id;
    },

    addThermalLoad(elementId: number, dtUniform: number, dtGradient: number): number {
      const id = nextLoadId++;
      const data: ThermalLoad = { id, elementId, dtUniform, dtGradient };
      loads.push({ type: 'thermal', data });
      return id;
    },

    toggleHinge(elemId: number, end: 'start' | 'end'): void {
      const elem = elements.get(elemId);
      if (!elem) return;
      if (end === 'start') {
        elements.set(elemId, { ...elem, hingeStart: !elem.hingeStart });
      } else {
        elements.set(elemId, { ...elem, hingeEnd: !elem.hingeEnd });
      }
    },

    // ─── 3D methods ───

    addDistributedLoad3D(elemId: number, qYI: number, qYJ: number, qZI: number, qZJ: number, a?: number, b?: number, caseId?: number): number {
      const id = nextLoadId++;
      const data: DistributedLoad3D = { id, elementId: elemId, qYI, qYJ, qZI, qZJ };
      if (a !== undefined && a > 0) data.a = a;
      if (b !== undefined) data.b = b;
      if (caseId !== undefined) data.caseId = caseId;
      loads.push({ type: 'distributed3d', data });
      return id;
    },

    addNodalLoad3D(nodeId: number, fx: number, fy: number, fz: number, mx: number, my: number, mz: number, caseId?: number): number {
      const id = nextLoadId++;
      const data: NodalLoad3D = { id, nodeId, fx, fy, fz, mx, my, mz };
      if (caseId !== undefined) data.caseId = caseId;
      loads.push({ type: 'nodal3d', data });
      return id;
    },

    addSurfaceLoad3D(_quadId: number, _q: number, _caseId?: number): number {
      return 0; // stub: no surface load support in mock
    },

    addPlate(_nodes: [number, number, number], _materialId: number, _thickness: number): number {
      return 0; // stub
    },

    addQuad(_nodes: [number, number, number, number], _materialId: number, _thickness: number): number {
      return 0; // stub
    },

    addConstraint(_c: import('../../../lib/engine/types-3d').Constraint3D): void {
      // stub
    },

    getModelData(): ModelData {
      return { nodes, elements, supports, loads, materials, sections };
    },
  };

  return api;
}
