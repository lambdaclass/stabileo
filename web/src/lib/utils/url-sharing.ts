// URL sharing: compress/decompress model snapshots for sharing via URL hash
// v1: LZ-String (legacy, still decoded for old links)
// v2: compact JSON + fflate deflate + base64url (new default)

import LZString from 'lz-string';
import { deflateSync, inflateSync } from 'fflate';
import type { ModelSnapshot } from '../store/history.svelte';
import type { DiagramType } from '../store/results.svelte';
import { modelStore } from '../store/model.svelte';
import { uiStore } from '../store/ui.svelte';
import { resultsStore } from '../store/results.svelte';

const MAX_URL_SAFE = 2000; // Characters — beyond this, many browsers/servers truncate

// ─── v2 format prefix ─────────────────────────────────────────────────────
// v2 compressed strings start with "2." so we can tell them apart from v1
const V2_PREFIX = '2.';

// ─── ShareMeta defaults ───────────────────────────────────────────────────
// Only non-default values are serialized → smaller payloads
const META_DEFAULTS: Record<string, unknown> = {
  diagramType: 'none',
  deformedScale: 100,
  diagramScale: 1,
  showDiagramValues: true,
  autoSolve: false,
  showGrid: true,
  gridSize: 1,
  snapToGrid: true,
  showNodeLabels: true,
  showElementLabels: false,
  showLengths: false,
  elementColorMode: 'uniform',
  showLoads: true,
  hideLoadsWithDiagram: true,
  showAxes: true,
  renderMode3D: 'wireframe',
  momentStyle3D: 'curved',
  cameraMode3D: 'perspective',
  showGrid3D: true,
  gridSize3D: 1,
  snapToGrid3D: true,
  showNodeLabels3D: true,
  showElementLabels3D: false,
  showLengths3D: false,
  showLoads3D: true,
  showAxes3D: true,
  axisConvention3D: 'rightHand',
  includeSelfWeight: false,
  liveCalc: false,
};

/** Metadata saved alongside the model to restore the exact view state */
export interface ShareMeta {
  diagramType?: DiagramType;
  deformedScale?: number;
  diagramScale?: number;
  autoSolve?: boolean;
  // 2D config
  showGrid?: boolean;
  gridSize?: number;
  snapToGrid?: boolean;
  showNodeLabels?: boolean;
  showElementLabels?: boolean;
  showLengths?: boolean;
  elementColorMode?: string;
  showLoads?: boolean;
  hideLoadsWithDiagram?: boolean;
  showAxes?: boolean;
  showDiagramValues?: boolean;
  // 3D config
  renderMode3D?: string;
  momentStyle3D?: string;
  cameraMode3D?: string;
  showGrid3D?: boolean;
  gridSize3D?: number;
  snapToGrid3D?: boolean;
  showNodeLabels3D?: boolean;
  showElementLabels3D?: boolean;
  showLengths3D?: boolean;
  showLoads3D?: boolean;
  showAxes3D?: boolean;
  axisConvention3D?: string;
  // Self-weight
  includeSelfWeight?: boolean;
  // Live calc
  liveCalc?: boolean;
  // Viewport state (2D)
  zoom?: number;
  panX?: number;
  panY?: number;
  // Camera state (3D)
  cameraPosition3D?: { x: number; y: number; z: number };
  cameraTarget3D?: { x: number; y: number; z: number };
}

// ─── Base64-URL helpers ───────────────────────────────────────────────────
function uint8ToBase64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToUint8(str: string): Uint8Array {
  // Restore standard base64
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ─── Round numbers to reduce JSON noise ───────────────────────────────────
function r(n: number, decimals = 6): number {
  if (Number.isInteger(n)) return n;
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

// ─── v2 compact serialization ─────────────────────────────────────────────
// Converts verbose ModelSnapshot+ShareMeta into a compact object with short keys
// and positional arrays instead of key-value objects.

function toCompact(snapshot: ModelSnapshot, meta?: ShareMeta): Record<string, unknown> {
  const c: Record<string, unknown> = {};

  // Analysis mode
  if (snapshot.analysisMode) c.m = snapshot.analysisMode;
  if (snapshot.name) c.nm = snapshot.name;

  // Nodes: [[id, x, y, z?], ...]  (z omitted when undefined/0 in 2D)
  c.n = snapshot.nodes.map(([, v]) => {
    const arr: number[] = [v.id, r(v.x), r(v.y)];
    if (v.z !== undefined && v.z !== 0) arr.push(r(v.z));
    return arr;
  });

  // Materials: [[id, name, e, nu, rho, fy?], ...]
  c.mt = snapshot.materials.map(([, v]) => {
    const arr: (string | number)[] = [v.id, v.name, r(v.e), r(v.nu), r(v.rho)];
    if ((v as any).fy != null) arr.push(r((v as any).fy));
    return arr;
  });

  // Section format version: 3 = iy/iz follow section local axis convention
  // (iy = about Y horizontal, iz = about Z vertical)
  c.sv = 3;

  // Sections: [[id, name, a, iz, {s?, b?, h?, w?, f?, t?, iy?, j?}], ...]
  c.sc = snapshot.sections.map(([, v]) => {
    const base: (string | number)[] = [v.id, v.name, r(v.a), r(v.iz)];
    const opt: Record<string, number | string> = {};
    if (v.shape) opt.s = v.shape;
    if (v.b != null) opt.b = r(v.b);
    if (v.h != null) opt.h = r(v.h);
    if (v.tw != null) opt.w = r(v.tw);
    if (v.tf != null) opt.f = r(v.tf);
    if (v.t != null) opt.t = r(v.t);
    if (v.iy != null) opt.iy = r(v.iy);
    if (v.j != null) opt.j = r(v.j);
    if (v.rotation) opt.rot = r(v.rotation);
    if (Object.keys(opt).length > 0) base.push(opt as any);
    return base;
  });

  // Elements: [[id, type(0=frame/1=truss), nodeI, nodeJ, matId, secId, flags?], ...]
  c.e = snapshot.elements.map(([, v]) => {
    const arr: (number | Record<string, number | boolean>)[] = [
      v.id, v.type === 'truss' ? 1 : 0, v.nodeI, v.nodeJ, v.materialId, v.sectionId,
    ];
    const opt: Record<string, number | boolean> = {};
    if (v.hingeStart) opt.hs = true;
    if (v.hingeEnd) opt.he = true;
    if (v.localYx != null) opt.lx = r(v.localYx);
    if (v.localYy != null) opt.ly = r(v.localYy);
    if (v.localYz != null) opt.lz = r(v.localYz);
    if ((v as any).rollAngle != null) opt.ra = r((v as any).rollAngle);
    if (Object.keys(opt).length > 0) arr.push(opt);
    return arr;
  });

  // Supports: [[id, nodeId, type, opts?], ...]
  c.s = snapshot.supports.map(([, v]) => {
    const arr: (number | string | Record<string, unknown>)[] = [v.id, v.nodeId, v.type];
    const opt: Record<string, unknown> = {};
    if (v.angle) opt.a = r(v.angle);
    if (v.isGlobal) opt.g = true;
    if (v.kx) opt.kx = r(v.kx);
    if (v.ky) opt.ky = r(v.ky);
    if (v.kz) opt.kz = r(v.kz);
    if (v.dx) opt.dx = r(v.dx);
    if (v.dy) opt.dy = r(v.dy);
    if (v.drz) opt.rz = r(v.drz);
    if (v.dz) opt.dz = r(v.dz);
    if (v.drx) opt.rx = r(v.drx);
    if (v.dry) opt.ry = r(v.dry);
    if (v.krx) opt.Rx = r(v.krx);
    if (v.kry) opt.Ry = r(v.kry);
    if (v.krz) opt.Rz = r(v.krz);
    if (Object.keys(opt).length > 0) arr.push(opt);
    return arr;
  });

  // Loads: kept as-is (already compact-ish, type+data varies widely)
  c.l = snapshot.loads;

  // Load cases
  if (snapshot.loadCases?.length) c.lc = snapshot.loadCases;
  // Combinations
  if (snapshot.combinations?.length) c.co = snapshot.combinations;

  // NextId: [node, mat, sec, elem, sup, load, loadCase?, combination?]
  const nid = snapshot.nextId;
  c.ni = [nid.node, nid.material, nid.section, nid.element, nid.support, nid.load,
    nid.loadCase ?? 3, nid.combination ?? 1];

  // ShareMeta: only non-default values
  if (meta) {
    const sm: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(meta)) {
      if (key === 'cameraPosition3D' || key === 'cameraTarget3D') {
        // Round camera values
        const v = val as { x: number; y: number; z: number };
        sm[key] = [r(v.x, 2), r(v.y, 2), r(v.z, 2)];
        continue;
      }
      if (val !== META_DEFAULTS[key]) {
        sm[key] = val;
      }
    }
    if (Object.keys(sm).length > 0) c._ = sm;
  }

  return c;
}

function fromCompact(c: Record<string, unknown>): ModelSnapshot {
  const snapshot: ModelSnapshot = {
    analysisMode: c.m as '2d' | '3d' | undefined,
    name: c.nm as string | undefined,

    // Nodes
    nodes: (c.n as number[][]).map(a => [a[0], { id: a[0], x: a[1], y: a[2], ...(a[3] !== undefined ? { z: a[3] } : {}) }]),

    // Materials
    materials: (c.mt as (string | number)[][]).map(a => [
      a[0] as number,
      { id: a[0] as number, name: a[1] as string, e: a[2] as number, nu: a[3] as number, rho: a[4] as number, ...(a[5] != null ? { fy: a[5] as number } : {}) },
    ]),

    // Sections — handle iy/iz convention migration
    // sv=3: new convention (iz = about Z vertical, iy = about Y horizontal)
    // no sv: old convention (iz was about Y / large, iy was about Z / small) → swap
    sections: (c.sc as any[]).map(a => {
      const opt = typeof a[4] === 'object' ? a[4] : {};
      const isNewConvention = (c.sv as number) >= 3;

      let iz: number, iy: number | undefined;
      if (isNewConvention) {
        iz = a[3]; // about Z vertical (new convention)
        iy = opt.iy ?? undefined; // about Y horizontal
      } else {
        // Old convention: a[3] was the large (about Y) value, opt.iy was the small (about Z) value
        iy = a[3]; // old iz → now iy (about Y horizontal)
        iz = opt.iy ?? a[3]; // old iy → now iz (about Z vertical); fallback to same value
      }

      return [a[0], {
        id: a[0], name: a[1], a: a[2], iz,
        ...(opt.s ? { shape: opt.s } : {}),
        ...(opt.b != null ? { b: opt.b } : {}),
        ...(opt.h != null ? { h: opt.h } : {}),
        ...(opt.w != null ? { tw: opt.w } : {}),
        ...(opt.f != null ? { tf: opt.f } : {}),
        ...(opt.t != null ? { t: opt.t } : {}),
        ...(iy != null ? { iy } : {}),
        ...(opt.j != null ? { j: opt.j } : {}),
        ...(opt.rot != null ? { rotation: opt.rot } : {}),
      }];
    }),

    // Elements
    elements: (c.e as any[]).map(a => {
      const opt = typeof a[6] === 'object' ? a[6] : {};
      return [a[0], {
        id: a[0], type: a[1] === 1 ? 'truss' : 'frame', nodeI: a[2], nodeJ: a[3],
        materialId: a[4], sectionId: a[5],
        hingeStart: opt.hs ?? false, hingeEnd: opt.he ?? false,
        ...(opt.lx != null ? { localYx: opt.lx } : {}),
        ...(opt.ly != null ? { localYy: opt.ly } : {}),
        ...(opt.lz != null ? { localYz: opt.lz } : {}),
        ...(opt.ra != null ? { rollAngle: opt.ra } : {}),
      }];
    }),

    // Supports
    supports: (c.s as any[]).map(a => {
      const opt = typeof a[3] === 'object' ? a[3] : {};
      return [a[0], {
        id: a[0], nodeId: a[1], type: a[2],
        ...(opt.a ? { angle: opt.a } : {}),
        ...(opt.g ? { isGlobal: true } : {}),
        ...(opt.kx ? { kx: opt.kx } : {}),
        ...(opt.ky ? { ky: opt.ky } : {}),
        ...(opt.kz ? { kz: opt.kz } : {}),
        ...(opt.dx ? { dx: opt.dx } : {}),
        ...(opt.dy ? { dy: opt.dy } : {}),
        ...(opt.rz ? { drz: opt.rz } : {}),
        ...(opt.dz ? { dz: opt.dz } : {}),
        ...(opt.rx ? { drx: opt.rx } : {}),
        ...(opt.ry ? { dry: opt.ry } : {}),
        ...(opt.Rx ? { krx: opt.Rx } : {}),
        ...(opt.Ry ? { kry: opt.Ry } : {}),
        ...(opt.Rz ? { krz: opt.Rz } : {}),
      }];
    }),

    // Loads
    loads: c.l as ModelSnapshot['loads'],

    // Load cases & combinations
    loadCases: c.lc as ModelSnapshot['loadCases'],
    combinations: c.co as ModelSnapshot['combinations'],

    // NextId
    nextId: (() => {
      const a = c.ni as number[];
      return { node: a[0], material: a[1], section: a[2], element: a[3], support: a[4], load: a[5], loadCase: a[6], combination: a[7] };
    })(),
  };

  // Restore ShareMeta from compact format
  const sm = c._ as Record<string, unknown> | undefined;
  if (sm) {
    const meta: Record<string, unknown> = { ...META_DEFAULTS };
    for (const [key, val] of Object.entries(sm)) {
      if (key === 'cameraPosition3D' || key === 'cameraTarget3D') {
        const a = val as number[];
        meta[key] = { x: a[0], y: a[1], z: a[2] };
        continue;
      }
      meta[key] = val;
    }
    (snapshot as any)._shareMeta = meta;
  }

  return snapshot;
}

// ─── v2 compress/decompress ───────────────────────────────────────────────

function compressV2(snapshot: ModelSnapshot, meta?: ShareMeta): string {
  const compact = toCompact(snapshot, meta);
  const json = JSON.stringify(compact);
  const bytes = new TextEncoder().encode(json);
  const deflated = deflateSync(bytes, { level: 9 });
  return V2_PREFIX + uint8ToBase64url(deflated);
}

function decompressV2(data: string): ModelSnapshot | null {
  try {
    const b64 = data.slice(V2_PREFIX.length);
    const deflated = base64urlToUint8(b64);
    const bytes = inflateSync(deflated);
    const json = new TextDecoder().decode(bytes);
    const compact = JSON.parse(json);
    return fromCompact(compact);
  } catch {
    return null;
  }
}

// ─── v1 (legacy LZ-String) ───────────────────────────────────────────────

/**
 * Compress a ModelSnapshot to a URL-safe string (v1 legacy, used only for undo history)
 */
export function compressSnapshot(snapshot: ModelSnapshot): string {
  const json = JSON.stringify(snapshot);
  return LZString.compressToEncodedURIComponent(json);
}

/**
 * Decompress a URL-safe string back to a ModelSnapshot.
 * Auto-detects v2 (prefix "2.") vs v1 (LZ-String) format.
 */
export function decompressSnapshot(data: string): ModelSnapshot | null {
  // v2 format
  if (data.startsWith(V2_PREFIX)) {
    return decompressV2(data);
  }
  // v1 (legacy LZ-String)
  try {
    const json = LZString.decompressFromEncodedURIComponent(data);
    if (!json) return null;
    const parsed = JSON.parse(json);
    if (!parsed.nodes || !parsed.nextId) return null;
    return parsed as ModelSnapshot;
  } catch {
    return null;
  }
}

// ─── Shared meta builder ──────────────────────────────────────────────────

function buildShareMeta(includeViewport: boolean): ShareMeta {
  const hasResults = resultsStore.results !== null || resultsStore.results3D !== null;
  const meta: ShareMeta = {
    diagramType: resultsStore.diagramType,
    deformedScale: resultsStore.deformedScale,
    diagramScale: resultsStore.diagramScale,
    showDiagramValues: resultsStore.showDiagramValues,
    autoSolve: hasResults,
    showGrid: uiStore.showGrid,
    gridSize: uiStore.gridSize,
    snapToGrid: uiStore.snapToGrid,
    showNodeLabels: uiStore.showNodeLabels,
    showElementLabels: uiStore.showElementLabels,
    showLengths: uiStore.showLengths,
    elementColorMode: uiStore.elementColorMode,
    showLoads: uiStore.showLoads,
    hideLoadsWithDiagram: uiStore.hideLoadsWithDiagram,
    showAxes: uiStore.showAxes,
    renderMode3D: uiStore.renderMode3D,
    momentStyle3D: uiStore.momentStyle3D,
    cameraMode3D: uiStore.cameraMode3D,
    showGrid3D: uiStore.showGrid3D,
    gridSize3D: uiStore.gridSize3D,
    snapToGrid3D: uiStore.snapToGrid3D,
    showNodeLabels3D: uiStore.showNodeLabels3D,
    showElementLabels3D: uiStore.showElementLabels3D,
    showLengths3D: uiStore.showLengths3D,
    showLoads3D: uiStore.showLoads3D,
    showAxes3D: uiStore.showAxes3D,
    axisConvention3D: uiStore.axisConvention3D,
    includeSelfWeight: uiStore.includeSelfWeight,
    liveCalc: uiStore.liveCalc,
  };
  if (includeViewport) {
    meta.zoom = uiStore.zoom;
    meta.panX = uiStore.panX;
    meta.panY = uiStore.panY;
    meta.cameraPosition3D = { ...uiStore.cameraPosition3D };
    meta.cameraTarget3D = { ...uiStore.cameraTarget3D };
  }
  return meta;
}

// ─── Generate URLs ────────────────────────────────────────────────────────

/**
 * Generate a share URL with the current model compressed in the hash fragment.
 * Returns { url, length } or null if model is empty.
 */
export function generateShareURL(): { url: string; length: number } | null {
  const snapshot = modelStore.snapshot();
  if (snapshot.nodes.length === 0) return null;

  snapshot.analysisMode = uiStore.analysisMode;
  const meta = buildShareMeta(true);

  const compressed = compressV2(snapshot, meta);
  const url = `${location.origin}${location.pathname}#data=${compressed}`;
  return { url, length: compressed.length };
}

/**
 * Generate an embed URL (same as share but with #embed= prefix).
 */
export function generateEmbedURL(): { url: string; length: number } | null {
  const snapshot = modelStore.snapshot();
  if (snapshot.nodes.length === 0) return null;

  snapshot.analysisMode = uiStore.analysisMode;
  const meta = buildShareMeta(false);

  const compressed = compressV2(snapshot, meta);
  const url = `${location.origin}${location.pathname}#embed=${compressed}`;
  return { url, length: compressed.length };
}

// ─── Restore meta helper ──────────────────────────────────────────────────

function restoreMeta(snapshot: ModelSnapshot): void {
  const meta = (snapshot as any)._shareMeta as ShareMeta | undefined;
  if (!meta) return;

  // Results visualization
  if (meta.deformedScale !== undefined) resultsStore.deformedScale = meta.deformedScale;
  if (meta.diagramScale !== undefined) resultsStore.diagramScale = meta.diagramScale;
  if (meta.showDiagramValues !== undefined) resultsStore.showDiagramValues = meta.showDiagramValues;
  // 2D visualization config
  if (meta.showGrid !== undefined) uiStore.showGrid = meta.showGrid;
  if (meta.gridSize !== undefined) uiStore.gridSize = meta.gridSize;
  if (meta.snapToGrid !== undefined) uiStore.snapToGrid = meta.snapToGrid;
  if (meta.showNodeLabels !== undefined) uiStore.showNodeLabels = meta.showNodeLabels;
  if (meta.showElementLabels !== undefined) uiStore.showElementLabels = meta.showElementLabels;
  if (meta.showLengths !== undefined) uiStore.showLengths = meta.showLengths;
  if (meta.elementColorMode !== undefined) uiStore.elementColorMode = meta.elementColorMode as any;
  if (meta.showLoads !== undefined) uiStore.showLoads = meta.showLoads;
  if (meta.hideLoadsWithDiagram !== undefined) uiStore.hideLoadsWithDiagram = meta.hideLoadsWithDiagram;
  if (meta.showAxes !== undefined) uiStore.showAxes = meta.showAxes;
  // 3D visualization config
  if (meta.renderMode3D !== undefined) uiStore.renderMode3D = meta.renderMode3D as any;
  if (meta.momentStyle3D !== undefined) uiStore.momentStyle3D = meta.momentStyle3D as any;
  if (meta.cameraMode3D !== undefined) uiStore.cameraMode3D = meta.cameraMode3D as any;
  if (meta.showGrid3D !== undefined) uiStore.showGrid3D = meta.showGrid3D;
  if (meta.gridSize3D !== undefined) uiStore.gridSize3D = meta.gridSize3D;
  if (meta.snapToGrid3D !== undefined) uiStore.snapToGrid3D = meta.snapToGrid3D;
  if (meta.showNodeLabels3D !== undefined) uiStore.showNodeLabels3D = meta.showNodeLabels3D;
  if (meta.showElementLabels3D !== undefined) uiStore.showElementLabels3D = meta.showElementLabels3D;
  if (meta.showLengths3D !== undefined) uiStore.showLengths3D = meta.showLengths3D;
  if (meta.showLoads3D !== undefined) uiStore.showLoads3D = meta.showLoads3D;
  if (meta.showAxes3D !== undefined) uiStore.showAxes3D = meta.showAxes3D;
  if (meta.axisConvention3D !== undefined) uiStore.axisConvention3D = meta.axisConvention3D as any;
  // Other settings
  if (meta.includeSelfWeight !== undefined) uiStore.includeSelfWeight = meta.includeSelfWeight;
  if (meta.liveCalc !== undefined) uiStore.liveCalc = meta.liveCalc;
  // Viewport state
  if (meta.zoom !== undefined) uiStore.zoom = meta.zoom;
  if (meta.panX !== undefined) uiStore.panX = meta.panX;
  if (meta.panY !== undefined) uiStore.panY = meta.panY;
  if (meta.cameraPosition3D) uiStore.cameraPosition3D = { ...meta.cameraPosition3D };
  if (meta.cameraTarget3D) uiStore.cameraTarget3D = { ...meta.cameraTarget3D };
  // Diagram type + autoSolve
  if (meta.autoSolve) {
    uiStore.pendingSolveFromURL = meta.diagramType ?? 'deformed';
  } else if (meta.diagramType) {
    resultsStore.diagramType = meta.diagramType;
  }
}

// ─── Load from URL / link ─────────────────────────────────────────────────

/**
 * Try to load a model from the current URL hash.
 * Returns 'data' | 'embed' | null depending on what was found.
 */
export function loadFromURLHash(): 'data' | 'embed' | null {
  const hash = location.hash;
  if (!hash) return null;

  let mode: 'data' | 'embed' | null = null;
  let compressed: string | null = null;

  if (hash.startsWith('#data=')) {
    mode = 'data';
    compressed = hash.slice(6);
  } else if (hash.startsWith('#embed=')) {
    mode = 'embed';
    compressed = hash.slice(7);
  }

  if (!mode || !compressed) return null;

  const snapshot = decompressSnapshot(compressed);
  if (!snapshot) return null;

  if (snapshot.analysisMode) {
    uiStore.analysisMode = snapshot.analysisMode;
  }

  modelStore.restore(snapshot);
  restoreMeta(snapshot);

  // Notify 3D viewport to restore camera from uiStore
  queueMicrotask(() => {
    window.dispatchEvent(new Event('stabileo-restore-camera-3d'));
  });

  // Clean hash from URL without triggering navigation
  history.replaceState(null, '', location.pathname + location.search);

  return mode;
}

/**
 * Parse a share URL and return the compressed data portion (or null if invalid).
 * Accepts full URLs like "https://stabileo.com/#data=..." or just the hash "#data=..."
 */
export function parseShareURL(url: string): { compressed: string; mode: 'data' | 'embed' } | null {
  try {
    let hash: string;
    if (url.includes('#')) {
      hash = '#' + url.split('#')[1];
    } else {
      return null;
    }
    if (hash.startsWith('#data=')) {
      return { compressed: hash.slice(6), mode: 'data' };
    } else if (hash.startsWith('#embed=')) {
      return { compressed: hash.slice(7), mode: 'embed' };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Load a model from a share link string (for "Pegar enlace" — opens in current context).
 * Returns true if successfully loaded, false otherwise.
 */
export function loadFromShareLink(url: string): boolean {
  const parsed = parseShareURL(url);
  if (!parsed) return false;

  const snapshot = decompressSnapshot(parsed.compressed);
  if (!snapshot) return false;

  if (snapshot.analysisMode) {
    uiStore.analysisMode = snapshot.analysisMode;
  }

  modelStore.restore(snapshot);
  restoreMeta(snapshot);

  // Notify 3D viewport to restore camera from uiStore
  queueMicrotask(() => {
    window.dispatchEvent(new Event('stabileo-restore-camera-3d'));
  });

  return true;
}

export { MAX_URL_SAFE };
