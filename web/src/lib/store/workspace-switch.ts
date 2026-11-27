import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { tabManager } from './tabs.svelte';
import { resultsStore } from './results.svelte';
import type { ModelSnapshot } from './history.svelte';
import type { SelfWeightLoad } from '../engine/analysis-settings';
import { GRAVITY_SELF_WEIGHT } from '../engine/analysis-settings';
import { hasBackup, needsPlaneChoice, restore3D, switchPlain } from './switch-2d';
import { seedProStarterLibrary } from '../pro/pro-starter-library';

/** The three ways of working on one tab's model. Educational is not one of them: it keeps its own. */
export type Workspace = 'plane' | 'space' | 'pro';

export function currentWorkspace(): Workspace {
  if (uiStore.appMode === 'pro') return 'pro';
  return uiStore.is3DWorkspace ? 'space' : 'plane';
}

/** What a PRO model holds that Basic computes differently, or not at all. */
export interface ProOnly {
  shells: number;
  shellLoads: number;
  constraints: number;
  connectors: number;
  /** A self-weight rule Basic's on/off toggle cannot state: scoped, sideways, or in several cases. */
  selfWeightRule: boolean;
}

const SHELL_LOADS = new Set(['surface3d', 'thermalQuad3d']);

/** Whether Basic's toggle reproduces this rule, and how. */
export function basicSelfWeight(rule: SelfWeightLoad[] | undefined): { on: boolean; caseId: number | null } | null {
  if (rule === undefined) return { on: uiStore.includeSelfWeight, caseId: uiStore.selfWeightCaseId };
  if (rule.length === 0) return { on: false, caseId: null };
  if (rule.length > 1) return null;
  const [r] = rule;
  const plain = r.direction === GRAVITY_SELF_WEIGHT.direction && r.factor === GRAVITY_SELF_WEIGHT.factor
    && r.elements === undefined && r.groupId === undefined;
  return plain ? { on: true, caseId: r.caseId } : null;
}

export function proOnlyContent(): ProOnly {
  return {
    shells: modelStore.plates.size + modelStore.quads.size,
    shellLoads: modelStore.loads.filter((l) => SHELL_LOADS.has(l.type)).length,
    constraints: modelStore.constraints.length,
    connectors: modelStore.model.connectors?.size ?? 0,
    selfWeightRule: basicSelfWeight(modelStore.analysis?.selfWeight) === null,
  };
}

export function needsBasicCopy(p: ProOnly = proOnlyContent()): boolean {
  return p.shells + p.shellLoads + p.constraints + p.connectors > 0 || p.selfWeightRule;
}

/** Basic reads its toggle, PRO its rule: carry the rule into the toggle so the results stay the same. */
function carrySelfWeightToBasic(): void {
  const basic = basicSelfWeight(modelStore.analysis?.selfWeight);
  if (!basic) return;
  uiStore.includeSelfWeight = basic.on;
  uiStore.selfWeightCaseId = basic.caseId;
}

/** Up to space: the same model, now with depth. A model cut out of a space one gets the original back. */
export function enterSpace(): void {
  if (hasBackup()) restore3D();
  else uiStore.analysisMode = '3d';
}

/** Up to PRO: the same model. An empty one starts with PRO's material pair, as a new PRO tab does. */
export function enterPro(): void {
  const empty = modelStore.nodes.size === 0 && modelStore.elements.size === 0;
  resultsStore.clear();
  resultsStore.clear3D();
  uiStore.analysisMode = 'pro';
  if (empty) seedProStarterLibrary();
}

/** Down from PRO, in place: only when nothing in the model changes meaning on the way. */
export function leaveProInPlace(): void {
  carrySelfWeightToBasic();
  resultsStore.clear();
  resultsStore.clear3D();
  uiStore.analysisMode = '3d';
}

/** Down to the plane: what to decide about the third dimension, or nothing when the model is flat. */
export function enterPlane(): 'ask' | 'done' {
  if (needsPlaneChoice()) return 'ask';
  switchPlain();
  return 'done';
}

/** The model without what Basic does not compute; the shells' loads and references go with them. */
export function basicCopySnapshot(snapshot: ModelSnapshot): ModelSnapshot {
  const groups = snapshot.groups?.map(([id, g]) => [id, {
    ...g, members: { ...g.members, plates: undefined, quads: undefined },
  }]) as ModelSnapshot['groups'];
  const { selfWeight: _rule, ...analysis } = snapshot.analysis ?? {};
  return {
    ...snapshot,
    plates: [],
    quads: [],
    constraints: [],
    connectors: [],
    loads: snapshot.loads.filter((l) => !SHELL_LOADS.has(l.type)),
    groups,
    analysis: Object.keys(analysis).length ? analysis : undefined,
  };
}

/** A simplified copy of this PRO tab in Basic, in a tab of its own; the PRO tab stays as it was. */
export function openBasicCopy(nameSuffix: string): void {
  const weight = basicSelfWeight(modelStore.analysis?.selfWeight);
  const name = `${modelStore.model.name || ''} (${nameSuffix})`.trim();
  const copy = { ...basicCopySnapshot(modelStore.snapshot()), name };
  tabManager.openCopy(name, copy, '3d');
  uiStore.includeSelfWeight = weight?.on ?? true;
  uiStore.selfWeightCaseId = weight?.caseId ?? null;
}

/**
 * A cut or projection just taken in place goes to a tab of its own, and this tab gets its space
 * model back: the 3D original is never replaced, so nothing has to be remembered to restore it.
 */
export function moveCutToNewTab(suffix: string): void {
  const derived = modelStore.snapshot();
  const stats = uiStore.simplified2DStats;
  const plane = uiStore.drawPlane2D;
  const name = `${modelStore.model.name || ''} (${suffix})`.trim();
  restore3D();
  tabManager.openCopy(name, { ...derived, name }, '2d');
  uiStore.drawPlane2D = plane;
  uiStore.simplified2DMode = true;
  uiStore.simplified2DStats = stats;
}

/** A new, empty plane tab; the space model stays where it is. Closing a tab is how a model is let go. */
export function openEmptyPlaneTab(): void {
  tabManager.createTab();
  uiStore.drawPlane2D = 'xy';
  uiStore.analysisMode = '2d';
}
