<script lang="ts">
  /**
   * The top of the Design stage: the four steps of design with their state, and the actions of the
   * step in hand.
   *
   * It replaces two rows. The ribbon showed seven commands in four groups over the desk (design
   * data, the desk itself, the concrete workflow, the 3-D detailing, the steel profiles, the
   * steel connections, a check under other codes), and the desk's own head carried «Design ›
   * Detail › Documents», «Equalise repeated frames» and a «Classic view». Two rows of buttons
   * that opened screens, with nothing saying where the work stood. Now the row says it: each step
   * shows whether it is done, in hand or waiting, and on what; pressing a step goes to its places
   * (the rail lists them), and the actions shown are the ones that make sense for that step, one
   * of each: «Size…» and the frame equaliser while sizing, «Generate detailing» while detailing.
   */
  import RecheckNotice from '../design/RecheckNotice.svelte';
  import RcRegenerationWarning from '../design/RcRegenerationWarning.svelte';
  import { t, tp } from '../../../lib/i18n';
  import { modelStore, resultsStore } from '../../../lib/store';
  import { materialFamilyOf } from '../../../lib/engine/steel/material-family';
  import { catalogueGradeFamily } from '../../../lib/engine/steel/grade-family';
  import { deskUi, stepOf, type DeskStep, type DeskTab } from '../../../lib/store/design-desk-ui.svelte';
  import { designRunStore } from '../../../lib/store/design-run.svelte';
  import { detailingStore } from '../../../lib/store/detailing.svelte';
  import { verificationStore } from '../../../lib/store/verification.svelte';
  import { designDrafts } from '../../../lib/store/design-drafts.svelte';
  import { equalizeAllFrames } from '../../../lib/store/frame-equalize';
  import { currentRcReadings } from '../../../lib/store/design-readings';
  import { designSteps } from '../../../lib/pro/design-steps';
  import { rcModelReadiness } from '../../../lib/flow/rc-stages';
  import { openDeskAt, leaveDesign } from '../../../lib/pro/design-navigation';
  import { rcGenerateDetailing } from '../../../lib/flow/rc-commands';
  import type { DeskRow } from './desk-rows';
  import type { ModelSlabColumnJoint } from '../../../lib/engine/design/analysis-validity';

  let { rows, docked, error, joint, place }: {
    rows: DeskRow[];
    docked: boolean;
    /** The place on screen: the step it belongs to is the step in hand. */
    place: DeskTab;
    error: { key: string; params: Record<string, string | number> } | null;
    joint: ModelSlabColumnJoint;
  } = $props();

  const solved = $derived(!!resultsStore.results3D);
  /** Whether the model holds a concrete member: detailing is a step only for concrete. */
  function hasConcrete(): boolean {
    for (const e of modelStore.elements.values()) {
      if (materialFamilyOf(modelStore.materials.get(e.materialId) as never, catalogueGradeFamily).family === 'concrete') return true;
    }
    return false;
  }
  const step = $derived(stepOf(place));
  const steps = $derived.by(() => {
    void verificationStore.providedRevision; void detailingStore.assemblies; void detailingStore.document;
    const size = { total: rows.length, fail: 0, stale: 0, unchecked: 0 };
    for (const r of rows) {
      if (r.status === 'fail' || r.status === 'provisional') size.fail++;
      else if (r.status === 'stale') size.stale++;
      else if (r.status === 'unavailable') size.unchecked++;
    }
    return designSteps(currentRcReadings(), size, { hasConcrete: hasConcrete() });
  });
  /** Where each step lands: the place it was last on, else its first. */
  const HOME: Record<DeskStep, DeskTab> = { prepare: 'prepare', size: 'plan', detail: 'detailing', document: 'documents' };
  const lastOf = $state<Partial<Record<DeskStep, DeskTab>>>({});
  $effect(() => { const s = stepOf(deskUi.tab); if (s) lastOf[s] = deskUi.tab; });

  /** The step in hand, its places in the rail, and the keyboard there: the next Tab continues in it. */
  function go(id: DeskStep) {
    openDeskAt(lastOf[id] ?? HOME[id]);
    queueMicrotask(() => document.querySelector<HTMLElement>('[data-testid="desk-rail"] button.on, [data-testid="desk-rail"] button')?.focus());
  }
  /** Where the project is, and the one sentence that says what it waits on. */
  const current = $derived(steps.find((s) => s.state === 'current') ?? null);
  const readiness = $derived(rcModelReadiness(currentRcReadings()));
  const detailReady = $derived(detailingStore.readiness);
  const detailBlockers = $derived(detailReady.prerequisites.map((p) => tp(p.key, { n: p.count, ids: p.elementIds.slice(0, 6).join(', ') })).join(' '));
  const hasDetailing = $derived(detailingStore.assemblies.length > 0);
  /** Members a change has left out of date, and what changed. */
  const outOfDate = $derived(rows.filter((r) => r.status === 'stale').length);
  let framesNote = $state<{ groups: number; n: number } | null>(null);
  const SR: Record<string, string> = {
    complete: 'design.stage.srComplete', current: 'design.stage.srCurrent', pending: 'design.stage.srPending',
    blocked: 'design.stage.srBlocked', optional: 'design.stage.srOptional',
  };
</script>

<header class="dp" data-testid="desk-process">
  <ol class="dp-steps" aria-label={t('desk.flow')}>
    {#each steps as s, i (s.id)}
      {#if i > 0}<li class="dp-sep" aria-hidden="true">›</li>{/if}
      <li>
        <!--
          Two markers, two questions: `aria-current` is where the PROJECT is (the first step not
          finished), `data-open` the step being READ (the place on screen). Reading a finished
          step does not move the «you are here» onto it.
        -->
        <button class="dp-step" class:on={step === s.id} data-state={s.state} data-open={step === s.id ? 'true' : undefined}
          aria-current={s.state === 'current' ? 'step' : undefined}
          title={s.todoKey ? t(s.todoKey) : t(`desk.step.${s.id}`)}
          onclick={() => go(s.id)} data-testid="desk-step-{s.id}">
          <span class="dp-mark" aria-hidden="true">{s.state === 'complete' ? '✓' : i + 1}</span>
          <span>{t(`desk.step.${s.id}`)}</span>
          {#if s.count > 0}<span class="dp-count" data-testid="desk-step-{s.id}-count">{s.count}</span>{/if}
          <span class="sr-only">{t(SR[s.state])}{s.todoKey ? `: ${t(s.todoKey)}` : ''}</span>
        </button>
      </li>
    {/each}
  </ol>

  <!-- The actions of the step in hand, one of each. -->
  <div class="dp-actions" role="group" aria-label={step ? t(`desk.step.${step}`) : t('desk.flow')} data-testid="desk-step-actions" data-step={step ?? ''}>
    {#if step === 'size'}
      <button class="dp-primary" disabled={!solved || designRunStore.running} onclick={() => (deskUi.ask = { scope: 'all' })} data-testid="desk-design">{t('desk.size')}</button>
      <button disabled={designRunStore.running} onclick={() => { const r = equalizeAllFrames(); framesNote = { groups: r.groups, n: r.members }; }} title={t('desk.equalizeFramesHint')} data-testid="desk-equalize-frames">{t('desk.equalizeFrames')}</button>
      {#if framesNote}<span class="dp-note" role="status" data-testid="desk-frames-note">{tp('desk.framesEqualized', framesNote)}</span>{/if}
    {/if}
    <!--
      Detailing follows sizing and precedes the documents, so its command stands in all three: the
      next thing to do after a design, the thing itself while detailing, and what brings the
      documents up to date. One button, the same action wherever it shows.
    -->
    {#if step === 'size' || step === 'detail' || step === 'document'}
      <button class:dp-primary={step === 'detail'} data-testid="cmd-generate-detailing" onclick={rcGenerateDetailing}
        disabled={!detailReady.ready || detailingStore.generating || designRunStore.running}
        title={detailReady.ready ? '' : detailBlockers}
      >{detailingStore.generating ? t('detailing.cmd.generating') : hasDetailing ? t('detailing.cmd.regenerate') : t('detailing.cmd.generate')}</button>
      <!-- What regenerating is about to replace, before it runs, beside the command. -->
      <RcRegenerationWarning />
    {/if}
  </div>

  <div class="dp-status">
    {#if designRunStore.running}<span class="dp-note" data-testid="desk-progress">{tp('desk.progress', { done: designRunStore.progress?.done ?? 0, total: designRunStore.progress?.total ?? 0 })}</span>{/if}
    {#if outOfDate > 0}
      <!-- What a model change left behind: the members it puts out of date, and why. -->
      <span class="dp-warn" role="status" data-testid="desk-out-of-date">{tp(verificationStore.outOfDateReason === 'design' ? 'desk.outOfDate.design' : 'desk.outOfDate.model', { n: outOfDate })}</span>
    {/if}
    {#if current?.todoKey}<span class="dp-next" data-testid="desk-step-next" data-readiness={readiness}>{t(current.todoKey)}</span>{/if}
    {#if !solved}<RecheckNotice />{/if}
    {#if error}<span class="dp-warn" role="alert" data-testid="desk-error">{tp(error.key, error.params)}</span>{/if}
    {#if joint.verdict === 'pointJoint'}<span class="dp-warn" role="status" data-testid="desk-slab-column-point-joint">{tp('slabColumnJoint.desk', { n: joint.pointJoints.length })}</span>{/if}
    <!-- Drafts kept by the editors (`design-drafts.svelte.ts`): said here until saved or discarded. -->
    {#if designDrafts.count > 0}
      <span class="dp-drafts" role="status" data-testid="desk-drafts">{tp('desk.drafts', { n: designDrafts.count })}
        {#each designDrafts.frames as d (d.key)}<button onclick={() => { deskUi.selected = d.members[0]!; openDeskAt('frame'); }} data-testid="desk-draft-{d.key}">{d.label}</button>{/each}
      </span>
    {/if}
  </div>
  {#if !docked}
    <!-- On a phone the desk covers the screen: its own way out. On a desktop the stage bar is. -->
    <button class="dp-close" onclick={leaveDesign} aria-label={t('desk.close')} data-testid="desk-close">✕</button>
  {/if}
</header>

<style>
  .dp { grid-area: head; display: flex; align-items: center; gap: 10px; padding: 5px 12px; border-bottom: 1px solid var(--st-hair); flex-wrap: wrap; background: var(--st-surface); color: var(--st-text); min-width: 0; }
  .dp-steps { display: flex; align-items: center; gap: 4px; margin: 0; padding: 0; list-style: none; flex: none; }
  .dp-sep { color: var(--st-text-3); font-size: 0.8rem; }
  .dp-step { display: inline-flex; align-items: center; gap: 5px; font-size: 0.74rem; padding: 3px 9px; border-radius: 4px; border: 1px solid var(--st-hair); background: none; color: var(--st-text-2); cursor: pointer; white-space: nowrap; }
  .dp-step:hover { background: var(--st-surface-3); color: var(--st-text); }
  .dp-step.on { border-color: var(--st-accent); color: var(--st-text); background: var(--st-surface-2, var(--st-surface)); }
  .dp-mark { display: inline-grid; place-items: center; width: 1.15rem; height: 1.15rem; border-radius: 50%; font-size: 0.62rem; border: 1px solid var(--st-hair-strong); color: var(--st-text-2); }
  .dp-step[data-state='complete'] .dp-mark { border-color: var(--st-ok); color: var(--st-ok); }
  .dp-step[data-state='current'] .dp-mark { border-color: var(--st-accent); color: var(--st-text); }
  .dp-step[data-state='blocked'] { opacity: 0.6; }
  .dp-count { font-size: 0.62rem; padding: 0 5px; border-radius: 8px; background: var(--st-danger); color: var(--st-on-accent, #fff); }
  .dp-actions { display: flex; align-items: center; gap: 6px; padding-left: 10px; border-left: 1px solid var(--st-hair); min-height: 1.6rem; }
  .dp-actions:empty { display: none; }
  .dp-actions button { font-size: 0.72rem; padding: 3px 10px; border-radius: 4px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); cursor: pointer; white-space: nowrap; }
  .dp-actions .dp-primary { border-color: var(--st-accent); background: var(--st-accent); color: var(--st-on-accent, #fff); }
  .dp-actions button:disabled { opacity: 0.5; cursor: default; }
  .dp-status { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; flex: 1; }
  .dp-note, .dp-warn, .dp-next { font-size: 0.7rem; color: var(--st-text-2); }
  .dp-warn { color: var(--st-warn); }
  .dp-drafts { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px; font-size: 0.7rem; color: var(--st-text); border-left: 2px solid var(--st-warn); padding-left: 6px; }
  .dp-drafts button { font-size: 0.68rem; padding: 1px 6px; border-radius: 4px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); cursor: pointer; }
  .dp-close { margin-left: auto; background: none; border: none; color: var(--st-text-2); font-size: 1rem; cursor: pointer; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  /* A short window: one line, scrolled sideways, rather than two rows over the viewer. */
  @media (max-height: 600px) {
    .dp { flex-wrap: nowrap; overflow-x: auto; padding: 3px 10px; gap: 8px; }
    .dp-status { flex-wrap: nowrap; }
  }
  /* A phone: the steps take the first line; the actions and what is said follow. */
  @media (max-width: 767px) {
    .dp { padding: 6px 8px; gap: 6px; }
    .dp-steps { overflow-x: auto; max-width: calc(100% - 2rem); }
    .dp-step { padding: 3px 6px; }
    .dp-actions { padding-left: 0; border-left: none; }
  }
</style>
