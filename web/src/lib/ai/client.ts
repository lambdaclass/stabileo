/**
 * AI backend client for Dedaliano capabilities.
 *
 * Talks to the Rust/Axum backend at /api/ai/*.
 * Configuration is via environment variables:
 *   VITE_AI_BACKEND_URL — base URL (default http://localhost:3001)
 *   VITE_AI_API_KEY     — bearer token
 */

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
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number };
  sections: Array<{ id: number; name: string }>;
  materials: Array<{ id: number; name: string }>;
  supportTypes: string[];
  elementTypes: string[];
  floorHeights: number[];
  bayWidths: number[];
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
  displacements: Array<{ ux: number; uy: number; rz?: number; uz?: number }>;
  reactions: Array<{ fx: number; fy: number; mz?: number; fz?: number }>;
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
    const v = Math.max(Math.abs(d.ux), Math.abs(d.uy), Math.abs(d.rz ?? 0), Math.abs(d.uz ?? 0));
    return v > max ? v : max;
  }, 0);

  const maxReact = results.reactions.reduce((max, r) => {
    const v = Math.sqrt(r.fx * r.fx + r.fy * r.fy + (r.fz ?? 0) * (r.fz ?? 0));
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

async function post<T>(path: string, body: unknown): Promise<T> {
  if (!API_KEY) {
    throw new Error('AI backend API key not configured (VITE_AI_API_KEY)');
  }

  const resp = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
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

export async function buildModel(
  description: string,
  locale?: string,
  analysisMode?: string,
  modelContext?: ModelContext,
  currentSnapshot?: Record<string, unknown>,
): Promise<BuildModelResponse> {
  const body: Record<string, unknown> = {
    description,
    locale: locale ?? 'en',
    analysisMode: analysisMode ?? '2d',
  };
  if (modelContext) body.modelContext = modelContext;
  if (currentSnapshot) body.currentSnapshot = currentSnapshot;

  const raw: any = await post('/api/ai/build-model', body);
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
