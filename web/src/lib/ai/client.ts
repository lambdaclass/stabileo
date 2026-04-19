/**
 * AI backend client for Dedaliano capabilities.
 *
 * Talks to the Rust/Axum backend at /api/ai/*.
 * Configuration is via environment variables:
 *   VITE_AI_BACKEND_URL — base URL (default http://localhost:3001)
 *   VITE_AI_API_KEY     — optional bearer token
 */

import { getElevation, hasElevation, VERTICAL_AXIS, type CoordinateNode } from '../geometry/coordinate-system';

const BACKEND_URL = import.meta.env.VITE_AI_BACKEND_URL || 'http://localhost:3001';
const API_KEY = import.meta.env.VITE_AI_API_KEY || '';

// ─── Types ─────────────────────────────────────────────────────

export interface ReviewFinding {
  title: string;
  severity: string;
  explanation: string;
  relatedDiagnostics: string[];
  affectedIds: number[];
  recommendation: string;
}

export interface ReviewMeta {
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  requestId: string;
}

export interface ReviewModelResponse {
  findings: ReviewFinding[];
  riskLevel: string;
  reviewOrder: string[];
  riskyAssumptions: string[];
  summary: string;
  meta: ReviewMeta;
}

export interface ExplainDiagnosticResponse {
  title: string;
  explanation: string;
  cause: string;
  fixSteps: string[];
  severityMeaning: string;
  meta: ReviewMeta;
}

export interface InterpretResultsResponse {
  answer: string;
  assessment: string;
  codeReferences: string[];
  warnings: string[];
  meta: ReviewMeta;
}

export interface BuildModelResponse {
  snapshot: Record<string, unknown> | null;
  message: string;
  changeSummary?: string;
  scopeRefusal?: boolean;
  rawAiResponse?: string;
  meta: ReviewMeta;
}

/** Compact model summary sent to the AI prompt for edit reasoning. */
export interface ModelContext {
  nodeCount: number;
  elementCount: number;
  supportCount: number;
  loadCount: number;
  bounds: { xMin: number; xMax: number; zMin: number; zMax: number; yMin?: number; yMax?: number };
  verticalAxis: typeof VERTICAL_AXIS;
  sections: Array<{ id: number; name: string }>;
  materials: Array<{ id: number; name: string }>;
  supportTypes: string[];
  elementTypes: string[];
  floorHeights: number[];
  bayWidths: number[];
}

/** Inputs for buildModelContext — decoupled from store for testability. */
export interface ModelStoreView {
  nodes: Map<number, CoordinateNode & { id: number }>;
  elements: Map<number, { id: number; type: string }>;
  sections: Map<number, { id: number; name: string }>;
  materials: Map<number, { id: number; name: string }>;
  supports: Map<number, { id: number; type: string }>;
  loads: unknown[];
}

/** Build a compact ModelContext from store data. */
export function buildModelContext(store: ModelStoreView): ModelContext {
  let xMin = Infinity, xMax = -Infinity;
  let yMin = Infinity, yMax = -Infinity;
  let zMin = Infinity, zMax = -Infinity;
  let hasZ = false;
  for (const n of store.nodes.values()) {
    if (n.x < xMin) xMin = n.x;
    if (n.x > xMax) xMax = n.x;
    if (hasElevation(n)) {
      // 3D node: n.y is depth axis, elevation (n.z) is vertical axis
      hasZ = true;
      if (n.y < yMin) yMin = n.y;
      if (n.y > yMax) yMax = n.y;
      const elev = getElevation(n);
      if (elev < zMin) zMin = elev;
      if (elev > zMax) zMax = elev;
    } else {
      // 2D node: n.y is vertical — map to z bounds (Z-up convention)
      if (n.y < zMin) zMin = n.y;
      if (n.y > zMax) zMax = n.y;
    }
  }

  const sections: Array<{ id: number; name: string }> = [];
  for (const [id, s] of store.sections) sections.push({ id, name: s.name });
  const materials: Array<{ id: number; name: string }> = [];
  for (const [id, m] of store.materials) materials.push({ id, name: m.name });

  const supTypes = new Set<string>();
  for (const s of store.supports.values()) supTypes.add(s.type);
  const elemTypes = new Set<string>();
  for (const e of store.elements.values()) elemTypes.add(e.type);

  const verticalAxis = VERTICAL_AXIS;
  const levelCounts = new Map<number, number>();
  const xSet = new Set<number>();
  for (const n of store.nodes.values()) {
    const level = hasZ ? getElevation(n) : n.y;
    levelCounts.set(level, (levelCounts.get(level) ?? 0) + 1);
    xSet.add(n.x);
  }
  const floorHeights = [...levelCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([level]) => level)
    .sort((a, b) => a - b);
  const xSorted = [...xSet].sort((a, b) => a - b);
  const bayWidths: number[] = [];
  for (let i = 1; i < xSorted.length; i++) {
    const w = +(xSorted[i] - xSorted[i - 1]).toFixed(4);
    if (w > 0) bayWidths.push(w);
  }

  return {
    nodeCount: store.nodes.size,
    elementCount: store.elements.size,
    supportCount: store.supports.size,
    loadCount: store.loads.length,
    bounds: { xMin, xMax, zMin, zMax, ...(hasZ ? { yMin, yMax } : {}) },
    verticalAxis,
    sections,
    materials,
    supportTypes: [...supTypes],
    elementTypes: [...elemTypes],
    floorHeights,
    bayWidths,
  };
}

// ─── Artifact construction ─────────────────────────────────────

// All fields are camelCase to match the Rust backend's #[serde(rename_all = "camelCase")]
interface SolverRunArtifact {
  meta: {
    engineVersion: string;
    buildTimestamp: string;
    buildSha: string;
    solverPath: string;
    nFreeDofs: number;
    nElements: number;
    nNodes: number;
  };
  diagnostics: Array<{
    code: string;
    severity: string;
    message: string;
    elementIds: number[];
    nodeIds: number[];
    dofIndices: number[];
    phase: string | null;
    value: number | null;
    threshold: number | null;
  }>;
  equilibrium: null;
  timings: null;
  resultSummary: null;
  fingerprint: {
    nDisplacements: number;
    nReactions: number;
    nElementForces: number;
    maxAbsDisplacement: number;
    maxAbsReaction: number;
  };
}

interface SolverDiagnostic {
  severity: string;
  code: string;
  message: string;
  elementIds?: number[];
  nodeIds?: number[];
}

interface AnalysisResultsLike {
  displacements: Array<{ ux: number; uy?: number; uz?: number; ry?: number; rz?: number }>;
  // 2D Reaction has rx/rz/my; 3D has fx/fy/fz/mx/my/mz — accept both
  reactions: Array<{ rx?: number; rz?: number; fx?: number; fy?: number; fz?: number; my?: number; mz?: number }>;
  elementForces: Array<Record<string, unknown>>;
  solverDiagnostics?: SolverDiagnostic[];
  timings?: { solverType?: string; nFree?: number };
}

export function buildArtifact(
  results: AnalysisResultsLike,
  nNodes: number,
  nElements: number,
): SolverRunArtifact {
  const diags = (results.solverDiagnostics ?? []).map(d => ({
    code: d.code,
    severity: d.severity,
    message: d.message,
    elementIds: d.elementIds ?? [],
    nodeIds: d.nodeIds ?? [],
    dofIndices: [] as number[],
    phase: null,
    value: null,
    threshold: null,
  }));

  const maxDisp = results.displacements.reduce((max, d) => {
    const v = Math.max(Math.abs(d.ux), Math.abs(d.uz ?? 0), Math.abs(d.ry ?? 0));
    return v > max ? v : max;
  }, 0);

  const maxReact = results.reactions.reduce((max, r) => {
    // 2D reactions: rx/rz/my; 3D reactions: fx/fy/fz
    const horizontal = r.rx ?? r.fx ?? 0;
    const vertical = r.rz ?? r.fz ?? 0;
    const v = Math.sqrt(horizontal * horizontal + vertical * vertical);
    return v > max ? v : max;
  }, 0);

  return {
    meta: {
      engineVersion: '0.1.0',
      buildTimestamp: new Date().toISOString(),
      buildSha: 'web-frontend',
      solverPath: results.timings?.solverType ?? 'unknown',
      nFreeDofs: results.timings?.nFree ?? (results.displacements.length * 3),
      nElements: nElements,
      nNodes: nNodes,
    },
    diagnostics: diags,
    equilibrium: null,
    timings: null,
    resultSummary: null,
    fingerprint: {
      nDisplacements: results.displacements.length,
      nReactions: results.reactions.length,
      nElementForces: results.elementForces.length,
      maxAbsDisplacement: maxDisp,
      maxAbsReaction: maxReact,
    },
  };
}

// ─── API calls ─────────────────────────────────────────────────

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }

  const resp = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    let message = text;
    try {
      const parsed = JSON.parse(text);
      if (parsed.error) message = parsed.error;
    } catch { /* use raw text */ }
    throw new Error(message || `AI backend error ${resp.status}`);
  }

  return resp.json();
}

export async function reviewModel(
  artifact: SolverRunArtifact,
  locale: string,
  context?: string,
): Promise<ReviewModelResponse> {
  return post('/api/ai/review-model', { artifact, locale, context });
}

export async function explainDiagnostic(
  code: string,
  severity: string,
  message?: string,
  locale?: string,
): Promise<ExplainDiagnosticResponse> {
  return post('/api/ai/explain-diagnostic', {
    code,
    severity,
    message,
    locale: locale ?? 'en',
  });
}

export async function interpretResults(
  resultSummary: Record<string, unknown>,
  question: string,
  locale?: string,
  modelInfo?: { nElements?: number; nNodes?: number; maxSpan?: number; structureType?: string },
): Promise<InterpretResultsResponse> {
  return post('/api/ai/interpret-results', {
    resultSummary,
    question,
    modelInfo,
    locale: locale ?? 'en',
  });
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SolverDiagnosticMsg {
  code: string;
  severity: string;
  message: string;
}

export async function buildModel(
  description: string,
  locale?: string,
  analysisMode?: string,
  modelContext?: ModelContext,
  currentSnapshot?: Record<string, unknown>,
  messages?: ConversationMessage[],
  solverDiagnostics?: SolverDiagnosticMsg[],
  signal?: AbortSignal,
): Promise<BuildModelResponse> {
  const body: Record<string, unknown> = {
    description,
    locale: locale ?? 'en',
    analysisMode: analysisMode ?? '2d',
  };
  if (modelContext) body.modelContext = modelContext;
  if (currentSnapshot) body.currentSnapshot = currentSnapshot;
  if (messages && messages.length > 0) body.messages = messages;
  if (solverDiagnostics && solverDiagnostics.length > 0) body.solverDiagnostics = solverDiagnostics;

  const raw: any = await post('/api/ai/build-model', body, signal);
  // Normalize: old backend returns { snapshot, interpretation }, new returns { snapshot, message }
  return {
    snapshot: raw.snapshot ?? null,
    message: raw.message ?? raw.interpretation ?? '',
    changeSummary: raw.changeSummary,
    scopeRefusal: raw.scopeRefusal,
    rawAiResponse: raw.rawAiResponse,
    meta: raw.meta,
  };
}
