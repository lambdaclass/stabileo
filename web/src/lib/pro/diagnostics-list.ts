/**
 * What PRO's Diagnostics lists, and the one count every other place says: the findings about the
 * model (identical messages grouped into one) that are not mere information, plus the notices
 * about the results.
 */
import type { SolverDiagnostic } from '../engine/types';
import { checkModel } from '../engine/model-diagnostics';
import { mergeFindings } from '../engine/model-findings';
import { withoutIssueRef } from '../engine/known-issue-message';
import { reviewModelSanity, sanityDiagnostics } from '../engine/model-sanity';
import { plateDiagnostics, zoneDiagnostics } from '../store/plate-diagnostics';
import { modelStore } from '../store/model.svelte';
import { resultsStore } from '../store/results.svelte';
import { uiStore } from '../store/ui.svelte';
import { t, i18n } from '../i18n';

export interface DiagnosticGroup {
  key: string;
  first: SolverDiagnostic;
  items: SolverDiagnostic[];
}

function modelChecks(): SolverDiagnostic[] {
  void (modelStore.nodes.size + modelStore.elements.size + modelStore.supports.size + modelStore.loads.length + modelStore.materials.size
    + modelStore.sections.size + modelStore.model.loadCases.length + (modelStore.model.plates?.size ?? 0) + (modelStore.model.quads?.size ?? 0));
  return checkModel({
    nodes: modelStore.nodes,
    elements: modelStore.elements,
    materials: modelStore.materials,
    sections: modelStore.sections,
    supports: modelStore.supports,
    loads: modelStore.loads as never,
    loadCases: modelStore.model.loadCases,
    plates: modelStore.model.plates,
    quads: modelStore.model.quads,
    connectors: modelStore.model.connectors,
    constraints: modelStore.model.constraints,
    combinations: modelStore.combinations,
    selfWeightCaseIds: (modelStore.analysis?.selfWeight ?? []).map((w) => w.caseId),
  });
}

function sanityChecks(is3D: boolean): SolverDiagnostic[] {
  if (!is3D) return [];
  const perCase = resultsStore.perCase3D;
  const reviewed = reviewModelSanity({
    model: { ...(modelStore.model as object), nodes: modelStore.nodes, elements: modelStore.elements, materials: modelStore.materials,
      sections: modelStore.sections, supports: modelStore.supports, loads: modelStore.loads, loadCases: modelStore.model.loadCases } as never,
    perCase,
    single: perCase.size === 0 ? resultsStore.results3D : null,
    modal: resultsStore.modalResult3D,
    includeSelfWeight: uiStore.includeSelfWeight,
    leftHand: uiStore.axisConvention3D === 'leftHand',
  });
  return reviewed ? sanityDiagnostics(reviewed.report, reviewed.shellKeys, t, i18n.locale) : [];
}

/** Every finding about the model, the gates' and the solver's, one per finding; the result notices (`known_issue`) are listed on their own. */
export function collectDiagnostics(is3D: boolean): SolverDiagnostic[] {
  const general = is3D ? resultsStore.diagnostics3D : resultsStore.diagnostics;
  const solver = is3D ? resultsStore.solverDiagnostics3D : resultsStore.solverDiagnostics;
  const fromGates = is3D ? resultsStore.structuredDiagnostics3D : resultsStore.structuredDiagnostics;
  void modelStore.modelVersion; void modelStore.model.groups;
  const objects = is3D ? [...plateDiagnostics(t), ...zoneDiagnostics(t)] : [];
  return [...objects, ...mergeFindings([...modelChecks(), ...sanityChecks(is3D)], general, solver, fromGates)].filter((d) => d.code !== 'known_issue');
}

/** A message with its numbers left out: "DOF 648 (node 121)…" and "DOF 649 (node 121)…" say the same thing. */
export function numbersMasked(text: string): string {
  return text.replace(/\d+(?:[.,]\d+)?/g, '…');
}

/** Findings that say the same thing (one per plate, say) as one group, in the order they first appear. */
export function groupDiagnostics(list: readonly SolverDiagnostic[]): DiagnosticGroup[] {
  const groups = new Map<string, DiagnosticGroup>();
  for (const d of list) {
    const key = `${d.severity}\u0000${d.source}\u0000${d.code}\u0000${numbersMasked(d.message)}`;
    const g = groups.get(key);
    if (g) g.items.push(d);
    else groups.set(key, { key, first: d, items: [d] });
  }
  return [...groups.values()];
}

export { withoutIssueRef };

export interface ReviewCount { model: number; results: number; total: number }

export function reviewCount(is3D: boolean): ReviewCount {
  const model = groupDiagnostics(collectDiagnostics(is3D)).filter((g) => g.first.severity !== 'info').length;
  const results = (is3D ? resultsStore.knownIssues3D : resultsStore.knownIssues).messages.length;
  return { model, results, total: model + results };
}
