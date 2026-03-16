// Stabileo Public API — programmatic access to the structural solver
//
// Exposes solve2D() and solve3D() as pure functions accepting JSON input.
// Used by:
//   - window.stabileo global (browser console / userscripts)
//   - API Playground panel
//   - Future integrations (notebooks, scripts)
//
// Input format matches the .ded file snapshot schema (arrays of [id, entity] tuples).
// Output is plain JSON (AnalysisResults / AnalysisResults3D).

import type { ModelData } from './solver-service';
import { validateAndSolve2D, validateAndSolve3D } from './solver-service';
import type { Node, Element, Support, Material, Section, Load } from '../store/model.svelte';
import type { Constraint3D } from './types-3d';

// ─── Public input schema (matches .ded ModelSnapshot) ─────────────

export interface ApiModelInput {
  nodes:       Array<[number, { id: number; x: number; y: number; z?: number }]>;
  materials:   Array<[number, { id: number; name: string; e: number; nu: number; rho: number; fy?: number }]>;
  sections:    Array<[number, { id: number; name: string; a: number; iz: number; b?: number; h?: number; shape?: string; tw?: number; tf?: number; t?: number; iy?: number; j?: number; rotation?: number }]>;
  elements:    Array<[number, { id: number; type: 'frame' | 'truss'; nodeI: number; nodeJ: number; materialId: number; sectionId: number; hingeStart?: boolean; hingeEnd?: boolean; localYx?: number; localYy?: number; localYz?: number; rollAngle?: number }]>;
  supports:    Array<[number, { id: number; nodeId: number; type: string; kx?: number; ky?: number; kz?: number; dx?: number; dy?: number; drz?: number; dz?: number; drx?: number; dry?: number; krx?: number; kry?: number; krz?: number; angle?: number; isGlobal?: boolean; normalX?: number; normalY?: number; normalZ?: number; isInclined?: boolean }]>;
  loads:       Array<{ type: string; data: Record<string, unknown> }>;
  plates?:     Array<[number, { id: number; nodes: [number, number, number]; materialId: number; thickness: number }]>;
  quads?:      Array<[number, { id: number; nodes: [number, number, number, number]; materialId: number; thickness: number }]>;
  constraints?: Array<Constraint3D>;
}

export interface ApiSolveOptions {
  includeSelfWeight?: boolean;
  leftHand?: boolean; // 3D only: left-hand axis convention
}

export interface ApiResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

// ─── Convert API input to ModelData (Maps) ────────────────────────

function toModelData(input: ApiModelInput): ModelData {
  return {
    nodes: new Map(input.nodes.map(([k, v]) => [k, { ...v }])) as Map<number, Node>,
    materials: new Map(input.materials.map(([k, v]) => [k, { ...v }])) as Map<number, Material>,
    sections: new Map(input.sections.map(([k, v]) => [k, { ...v }])) as Map<number, Section>,
    elements: new Map(input.elements.map(([k, v]) => [k, {
      ...v,
      hingeStart: v.hingeStart ?? false,
      hingeEnd: v.hingeEnd ?? false,
    }])) as Map<number, Element>,
    supports: new Map(input.supports.map(([k, v]) => [k, { ...v }])) as Map<number, Support>,
    loads: input.loads.map(l => ({ type: l.type, data: { ...l.data } })) as unknown as Load[],
    plates: input.plates ? new Map(input.plates) : undefined,
    quads: input.quads ? new Map(input.quads) : undefined,
    constraints: input.constraints,
  };
}

// ─── Sanitize results for JSON (strip Maps, functions, etc.) ──────

function sanitizeResult(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'number' || typeof obj === 'string' || typeof obj === 'boolean') return obj;
  if (obj instanceof Map) {
    return Array.from(obj.entries()).map(([k, v]) => [k, sanitizeResult(v)]);
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeResult);
  }
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'function') continue;
      out[k] = sanitizeResult(v);
    }
    return out;
  }
  return obj;
}

// ─── Public API functions ─────────────────────────────────────────

export function solve2D(input: ApiModelInput, options?: ApiSolveOptions): ApiResult {
  try {
    const model = toModelData(input);
    const result = validateAndSolve2D(model, options?.includeSelfWeight ?? false);
    if (result === null) {
      return { ok: false, error: 'Model is empty or invalid (need ≥2 nodes, ≥1 element, ≥1 support)' };
    }
    if (typeof result === 'string') {
      return { ok: false, error: result };
    }
    return { ok: true, data: sanitizeResult(result) };
  } catch (e: any) {
    return { ok: false, error: e.message || String(e) };
  }
}

export function solve3D(input: ApiModelInput, options?: ApiSolveOptions): ApiResult {
  try {
    const model = toModelData(input);
    const result = validateAndSolve3D(model, options?.includeSelfWeight ?? false, options?.leftHand ?? false);
    if (result === null) {
      return { ok: false, error: 'Model is empty or invalid (need ≥2 nodes, ≥1 element, ≥1 support)' };
    }
    if (typeof result === 'string') {
      return { ok: false, error: result };
    }
    return { ok: true, data: sanitizeResult(result) };
  } catch (e: any) {
    return { ok: false, error: e.message || String(e) };
  }
}

// ─── Example input for documentation ──────────────────────────────

export const EXAMPLE_INPUT_2D: ApiModelInput = {
  nodes: [
    [1, { id: 1, x: 0, y: 0 }],
    [2, { id: 2, x: 4, y: 0 }],
    [3, { id: 3, x: 8, y: 0 }],
  ],
  materials: [
    [1, { id: 1, name: 'Steel', e: 200000, nu: 0.3, rho: 78.5 }],
  ],
  sections: [
    [1, { id: 1, name: 'IPE300', a: 0.005381, iz: 0.00008356 }],
  ],
  elements: [
    [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }],
    [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1 }],
  ],
  supports: [
    [1, { id: 1, nodeId: 1, type: 'pinned' }],
    [2, { id: 2, nodeId: 3, type: 'rollerX' }],
  ],
  loads: [
    { type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } },
    { type: 'nodal', data: { nodeId: 2, fx: 0, fy: -20, mz: 0 } },
  ],
};
