import type {
  BuildModelResponse,
  ConversationMessage,
  ExplainDiagnosticResponse,
  InterpretResultsResponse,
  ModelContext,
  ReviewFinding,
  ReviewMeta,
  ReviewModelResponse,
  SolverDiagnosticMsg,
} from './client';
import type { AiCredentials } from './keys.svelte';
import { t } from '../i18n';
import { is3DWorkspace } from '../utils/workspace';
import {
  AiActionError,
  buildConversation,
  buildSystemPrompt,
  checkPromptSize,
  checkText,
  checkListLen,
  MAX_LIST_LEN,
  outcomeFromText,
  outcomeFromToolCall,
  promptLabel,
  sanitizeLocale,
  toolDefinitions,
  validateBuildRequest,
  isSpaceProtocol,
  type AnalysisMode,
  type ToolOutcome,
} from './capabilities';
import {
  EXPLAIN_SCHEMA,
  INTERPRET_SCHEMA,
  REVIEW_SCHEMA,
  explainSystemPrompt,
  interpretSystemPrompt,
  reviewSystemPrompt,
} from './prompts';
import { AiProviderError, withoutKey, type LlmProvider, type LlmRequest, type LlmResponse } from './providers/types';

async function providerFor(creds: AiCredentials): Promise<LlmProvider> {
  if (creds.provider === 'openai') return (await import('./providers/openai')).openaiProvider;
  return (await import('./providers/anthropic')).anthropicProvider;
}

async function complete(creds: AiCredentials, req: LlmRequest): Promise<LlmResponse> {
  const provider = await providerFor(creds);
  try {
    return await provider.complete(creds.apiKey, req);
  } catch (err) {
    throw withoutKey(err, creds.apiKey);
  }
}

function metaOf(resp: LlmResponse): ReviewMeta {
  return {
    modelUsed: resp.model,
    inputTokens: resp.inputTokens,
    outputTokens: resp.outputTokens,
    latencyMs: resp.latencyMs,
    requestId: resp.requestId,
  };
}

function stripFences(content: string): string {
  const trimmed = content.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```(?:json)?/, '').replace(/```$/, '').trim();
}

export function parseJsonObject(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch {
    throw new AiProviderError('badResponse');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new AiProviderError('badResponse');
  return parsed as Record<string, unknown>;
}

function str(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== 'string') throw new AiProviderError('badResponse');
  return v;
}

function oneOf(obj: Record<string, unknown>, key: string, allowed: readonly string[]): string {
  const v = str(obj, key);
  if (!allowed.includes(v)) throw new AiProviderError('badResponse');
  return v;
}

const enumOf = (schema: Record<string, unknown>, ...path: string[]): string[] =>
  path.reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], schema) as string[];

function strList(obj: Record<string, unknown>, key: string, optional = false): string[] {
  const v = obj[key];
  if (v === undefined && optional) return [];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new AiProviderError('badResponse');
  return v as string[];
}

function idList(obj: Record<string, unknown>, key: string): number[] {
  const v = obj[key];
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every((x) => Number.isInteger(x) && x >= 0)) throw new AiProviderError('badResponse');
  return v as number[];
}

export function parseReview(text: string): Omit<ReviewModelResponse, 'meta'> {
  const raw = parseJsonObject(text);
  if (!Array.isArray(raw.findings)) throw new AiProviderError('badResponse');
  const findings: ReviewFinding[] = raw.findings.map((f) => {
    if (!f || typeof f !== 'object') throw new AiProviderError('badResponse');
    const o = f as Record<string, unknown>;
    return {
      title: str(o, 'title'),
      severity: oneOf(o, 'severity', enumOf(REVIEW_SCHEMA, 'properties', 'findings', 'items', 'properties', 'severity', 'enum')),
      explanation: str(o, 'explanation'),
      relatedDiagnostics: strList(o, 'relatedDiagnostics', true),
      affectedIds: idList(o, 'affectedIds'),
      recommendation: str(o, 'recommendation'),
    };
  });
  return {
    findings,
    riskLevel: oneOf(raw, 'riskLevel', enumOf(REVIEW_SCHEMA, 'properties', 'riskLevel', 'enum')),
    reviewOrder: strList(raw, 'reviewOrder'),
    riskyAssumptions: strList(raw, 'riskyAssumptions'),
    summary: str(raw, 'summary'),
  };
}

export async function reviewModel(
  creds: AiCredentials,
  artifact: unknown,
  locale: string,
  context?: string,
): Promise<ReviewModelResponse> {
  if (context !== undefined) checkText('context', context);
  const system = reviewSystemPrompt(sanitizeLocale(locale));
  const artifactJson = JSON.stringify(artifact, null, 2);
  const user = context !== undefined
    ? `## Solver Run Artifact\n\n\`\`\`json\n${artifactJson}\n\`\`\`\n\n## User Notes\n\n${context}`
    : `## Solver Run Artifact\n\n\`\`\`json\n${artifactJson}\n\`\`\``;
  checkPromptSize(system, user);
  const resp = await complete(creds, {
    system,
    messages: [{ role: 'user', content: user }],
    maxTokens: 16000,
    json: { name: 'model_review', schema: REVIEW_SCHEMA },
  });
  return { ...parseReview(resp.text), meta: metaOf(resp) };
}

export async function explainDiagnostic(
  creds: AiCredentials,
  code: string,
  severity: string,
  message?: string,
  locale?: string,
): Promise<ExplainDiagnosticResponse> {
  if (message !== undefined) checkText('message', message);
  const system = explainSystemPrompt(sanitizeLocale(locale));
  let details = `Diagnostic code: ${promptLabel(code)}\nSeverity: ${promptLabel(severity)}`;
  if (message !== undefined) details += `\nMessage: ${message}`;
  const resp = await complete(creds, {
    system,
    messages: [{ role: 'user', content: details }],
    maxTokens: 8000,
    json: { name: 'diagnostic_explanation', schema: EXPLAIN_SCHEMA },
  });
  const raw = parseJsonObject(resp.text);
  return {
    title: str(raw, 'title'),
    explanation: str(raw, 'explanation'),
    cause: str(raw, 'cause'),
    fixSteps: strList(raw, 'fixSteps'),
    severityMeaning: str(raw, 'severityMeaning'),
    meta: metaOf(resp),
  };
}

export async function interpretResults(
  creds: AiCredentials,
  resultSummary: Record<string, unknown>,
  question: string,
  locale?: string,
  modelInfo?: { nElements?: number; nNodes?: number; maxSpan?: number; structureType?: string },
): Promise<InterpretResultsResponse> {
  checkText('question', question);
  const system = interpretSystemPrompt(sanitizeLocale(locale));
  let user = `## Result Summary\n\n\`\`\`json\n${JSON.stringify(resultSummary, null, 2)}\n\`\`\`\n\n## Question\n\n${question}`;
  if (modelInfo) {
    user += '\n\n## Model Info\n';
    if (modelInfo.nElements !== undefined) user += `- Elements: ${modelInfo.nElements}\n`;
    if (modelInfo.nNodes !== undefined) user += `- Nodes: ${modelInfo.nNodes}\n`;
    if (modelInfo.maxSpan !== undefined) user += `- Max span: ${modelInfo.maxSpan} m\n`;
    if (modelInfo.structureType !== undefined) user += `- Structure type: ${promptLabel(modelInfo.structureType)}\n`;
  }
  checkPromptSize(system, user);
  const resp = await complete(creds, {
    system,
    messages: [{ role: 'user', content: user }],
    maxTokens: 8000,
    json: { name: 'results_interpretation', schema: INTERPRET_SCHEMA },
  });
  const raw = parseJsonObject(resp.text);
  return {
    answer: str(raw, 'answer'),
    assessment: oneOf(raw, 'assessment', enumOf(INTERPRET_SCHEMA, 'properties', 'assessment', 'enum')),
    codeReferences: strList(raw, 'codeReferences', true),
    warnings: strList(raw, 'warnings', true),
    meta: metaOf(resp),
  };
}

function inMode(outcome: ToolOutcome, mode: AnalysisMode): ToolOutcome {
  if (outcome.kind === 'snapshot' && isSpaceProtocol(outcome.snapshot.analysisMode) !== isSpaceProtocol(mode)) {
    throw new AiActionError(t(isSpaceProtocol(mode) ? 'ai.err.planarInSpace' : 'ai.err.spaceInPlane'));
  }
  return outcome;
}

function toBuildResponse(outcome: ToolOutcome, raw: string, meta: ReviewMeta): BuildModelResponse {
  if (outcome.kind === 'snapshot') {
    return { snapshot: outcome.snapshot, message: outcome.message, changeSummary: outcome.changeSummary, rawAiResponse: raw, meta };
  }
  if (outcome.kind === 'refusal') {
    return { snapshot: null, message: outcome.message, scopeRefusal: true, rawAiResponse: raw, meta };
  }
  return { snapshot: null, message: outcome.message, rawAiResponse: raw, meta };
}

export async function buildModel(
  creds: AiCredentials,
  description: string,
  locale: string,
  analysisMode: string,
  modelContext?: ModelContext,
  currentSnapshot?: Record<string, unknown>,
  messages?: ConversationMessage[],
  solverDiagnostics?: SolverDiagnosticMsg[],
  signal?: AbortSignal,
): Promise<BuildModelResponse> {
  validateBuildRequest(description, analysisMode, messages, solverDiagnostics);
  if (modelContext) {
    for (const field of ['sections', 'materials', 'supportTypes', 'elementTypes', 'floorHeights', 'bayWidths'] as const) {
      checkListLen(`modelContext.${field}`, modelContext[field].length, MAX_LIST_LEN);
    }
  }
  const mode = analysisMode as AnalysisMode;
  const declared = currentSnapshot?.analysisMode;
  if (declared !== undefined) {
    if (!(typeof declared === 'string' && ['2d', '3d', 'pro', 'edu'].includes(declared))) {
      throw new AiActionError(`the model on the canvas has an unknown analysis mode ${JSON.stringify(declared)}; nothing was built`);
    }
    if (is3DWorkspace(declared) !== isSpaceProtocol(mode)) {
      throw new AiActionError(`the model on the canvas is ${is3DWorkspace(declared) ? '3D' : '2D'} but the request is ${isSpaceProtocol(mode) ? '3D' : '2D'}; nothing was built`);
    }
  }
  const current = currentSnapshot ? { ...currentSnapshot, analysisMode: mode } : undefined;
  const system = buildSystemPrompt(sanitizeLocale(locale), mode, modelContext, current);
  const conversation = buildConversation(description, messages, solverDiagnostics);
  checkPromptSize(system, conversation.map((m) => m.content).join(''));
  const resp = await complete(creds, {
    system,
    messages: conversation,
    maxTokens: 32000,
    tools: toolDefinitions(mode, current !== undefined),
    signal,
  });
  let built: BuildModelResponse;
  try {
    built = buildFromResponse(resp, mode, current);
  } catch (err) {
    if (err instanceof AiActionError && mentionsKey(err.message, creds.apiKey)) throw new AiActionError(t('ai.err.keyInAnswer'));
    throw err;
  }
  const clean = (v: string | undefined): string | undefined => (v === undefined ? v : scrubKey(v, creds.apiKey));
  return { ...built, message: scrubKey(built.message, creds.apiKey), changeSummary: clean(built.changeSummary), rawAiResponse: clean(built.rawAiResponse) };
}

const keyParts = (apiKey: string): string[] => (apiKey ? [apiKey, apiKey.slice(0, 12)] : []);
const mentionsKey = (text: string, apiKey: string): boolean => keyParts(apiKey).some((part) => text.includes(part));
const scrubKey = (text: string, apiKey: string): string => keyParts(apiKey).reduce((out, part) => out.split(part).join('[key]'), text);

function buildFromResponse(resp: LlmResponse, mode: AnalysisMode, current?: Record<string, unknown>): BuildModelResponse {
  const meta = metaOf(resp);
  if (resp.toolCalls.length > 1) throw new AiActionError(t('ai.err.oneChange'));
  const checked = (outcome: ToolOutcome): ToolOutcome => inMode(outcome, mode);
  const call = resp.toolCalls[0];
  if (call) {
    const raw = `tool_call: ${call.name}(${JSON.stringify(call.input)})`;
    const outcome = outcomeFromToolCall(call.name, call.input, current);
    if (!outcome) throw new AiActionError(`the ${JSON.stringify(call.name)} call could not be read as a tool with valid parameters; nothing was built`);
    return toBuildResponse(checked(outcome), raw, meta);
  }
  const text = resp.text.trim();
  return toBuildResponse(checked(outcomeFromText(text, current)), text, meta);
}
