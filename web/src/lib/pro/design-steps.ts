/**
 * The four steps of design as the top of the Design stage shows them: prepare, size, detail and
 * document, each with its state and, when it is not finished, the one sentence that says what it
 * waits on.
 *
 * Pure, and derived from the readings the concrete pipeline already resolves (`rc-stages.ts`), so
 * the steps cannot come to disagree with the commands they gate: the model and the code chosen
 * make Prepare; every member the design reads verifying (concrete, steel and the other materials,
 * as the desk lists them) makes Size; the coordinated bars with no open conflict make Detail; a
 * document built makes Document, which is never required.
 */
import { rcModelReadiness, rcStages, rcStageTodoKey, type RcFlowReadings, type RcStageState } from '../flow/rc-stages';
import type { DeskStep } from '../store/design-desk-ui.svelte';

/** What the desk's list holds, by verdict: every member design reads, of any material. */
export interface SizeCounts {
  total: number;
  /** Fails, provisional or at the limit failing: what does not verify. */
  fail: number;
  /** Checked against an analysis a change has cleared. */
  stale: number;
  /** Could not be checked (inputs missing, not supported, no bars yet). */
  unchecked: number;
}

export interface DesignStep {
  id: DeskStep;
  state: RcStageState;
  /** i18n key of what the step waits on; null when it is finished. */
  todoKey: string | null;
  /** The count the step shows beside its name (failing members, open conflicts); 0 for none. */
  count: number;
}

/**
 * `hasConcrete`: whether the model holds a concrete member at all (the demands that fill
 * `designApplicable` arrive only after a solve). Without it, read from `designApplicable`.
 */
export function designSteps(r: RcFlowReadings, size: SizeCounts, opts: { hasConcrete?: boolean } = {}): DesignStep[] {
  const rc = rcStages(r);
  const of = (id: string) => rc.find((s) => s.id === id)!;
  const readiness = rcModelReadiness(r);
  const model = of('model'), codes = of('codes');
  const prepared = model.complete && r.codeChosen;
  const sized = size.total > 0 && size.fail + size.stale + size.unchecked === 0;
  /*
   * Detailing coordinates concrete bars; a model with no concrete to design has nothing to detail,
   * so the step is not one it has to take.
   */
  const detailOptional = !(opts.hasConcrete ?? r.designApplicable > 0);
  const detail = of('detailing'), docs = of('documents');
  const complete: Record<DeskStep, boolean> = {
    prepare: prepared,
    size: sized,
    detail: !detailOptional && detail.complete,
    document: docs.complete,
  };
  const optional: Record<DeskStep, boolean> = { prepare: false, size: false, detail: detailOptional, document: true };
  const order: DeskStep[] = ['prepare', 'size', 'detail', 'document'];
  const current = order.find((s) => !complete[s] && !optional[s]) ?? null;
  const noModel = readiness === 'empty';
  const todo: Record<DeskStep, string> = {
    prepare: !model.complete ? rcStageTodoKey(model, readiness) : codes.todoKey,
    size: size.total === 0 ? 'design.stage.needDemands'
      : size.stale > 0 ? 'desk.step.todo.stale'
        : size.fail > 0 ? 'desk.step.todo.fail' : 'desk.step.todo.unchecked',
    detail: r.designProposed === 0 ? 'design.stage.needDesign'
      : (r.detailingConflicts ?? 0) > 0 ? 'desk.step.todo.conflicts' : detail.todoKey,
    document: docs.todoKey,
  };
  const count: Record<DeskStep, number> = {
    prepare: 0,
    size: size.fail + size.stale,
    detail: r.detailingConflicts ?? 0,
    document: 0,
  };
  return order.map((id): DesignStep => {
    // With no model, what cannot start is blocked, detailing included; documenting stays optional.
    const state: RcStageState = complete[id] ? 'complete'
      : id === current ? 'current'
        : noModel && id !== 'document' ? 'blocked'
          : optional[id] ? 'optional' : 'pending';
    return { id, state, todoKey: complete[id] ? null : todo[id], count: count[id] };
  });
}
