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
      severity: str(o, 'severity'),
      explanation: str(o, 'explanation'),
      relatedDiagnostics: strList(o, 'relatedDiagnostics', true),
      affectedIds: idList(o, 'affectedIds'),
      recommendation: str(o, 'recommendation'),
    };
  });
  return {
    findings,
    riskLevel: str(raw, 'riskLevel'),
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
    assessment: str(raw, 'assessment'),
    codeReferences: strList(raw, 'codeReferences', true),
    warnings: strList(raw, 'warnings', true),
    meta: metaOf(resp),
  };
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
  const current = currentSnapshot ? { ...currentSnapshot, analysisMode: mode } : undefined;
  const system = buildSystemPrompt(sanitizeLocale(locale), mode, modelContext, current);
  const conversation = buildConversation(description, messages, solverDiagnostics);
  checkPromptSize(system, conversation.map((m) => m.content).join(''));
  const resp = await complete(creds, {
    system,
    messages: conversation,
    maxTokens: 32000,
    tools: toolDefinitions(mode, modelContext !== undefined),
    signal,
  });
  const meta = metaOf(resp);
  if (resp.toolCalls.length > 1) throw new AiActionError(t('ai.err.oneChange'));
  const call = resp.toolCalls[0];
  if (call) {
    const raw = `tool_call: ${call.name}(${JSON.stringify(call.input)})`;
    const outcome = outcomeFromToolCall(call.name, call.input, current);
    if (outcome) return toBuildResponse(outcome, raw, meta);
  }
  const text = resp.text.trim();
  return toBuildResponse(outcomeFromText(text, current), text, meta);
}
