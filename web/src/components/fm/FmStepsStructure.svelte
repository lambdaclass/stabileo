<script lang="ts">
  /**
   * Steps 1–4 of the flexibility method: the count, the primary structure,
   * and the states solved on it. Every state is drawn, because the method is
   * learnt from the diagrams — the numbers under them are for checking.
   */
  import { t } from '../../lib/i18n';
  import { fmStepsStore } from '../../lib/store';
  import type { ForceMethodResult, StateResult } from '../../lib/engine/force-method/solve';
  import FmSketch from './FmSketch.svelte';
  import { redundantText, xName, num, componentName, sub } from './fm-text';

  let { r, step }: { r: ForceMethodResult; step: number } = $props();

  const c = $derived(r.count);
  const unknowns = $derived(c.reactions + c.springs + c.barUnknowns);
  /** The unit state on screen, clamped to the redundants there are. */
  const k = $derived(Math.min(Math.max(fmStepsStore.selectedState, 1), Math.max(r.redundants.length, 1)));
  const rotated = (nodeId: number) => r.original.supports.some((s) => s.nodeId === nodeId && s.angle !== undefined);
</script>

{#snippet stateTables(st: StateResult)}
  <h5 class="fm-h">{t('fm.s3.reactions')}</h5>
  <table class="fm-table" data-testid="fm-reactions">
    <thead><tr><th>{t('fm.s3.node')}</th><th></th><th>kN · kN·m</th></tr></thead>
    <tbody>
      {#each st.reactions.filter((q) => Math.abs(q.value) > 1e-9) as q (q.nodeId + ':' + q.component)}
        <tr><td>{q.nodeId}</td><td>{componentName(q.component, rotated(q.nodeId))}</td><td>{num(q.value)}</td></tr>
      {/each}
    </tbody>
  </table>
  <h5 class="fm-h">{t('fm.s3.endMoments')}</h5>
  <table class="fm-table">
    <thead><tr><th>{t('fm.s3.bar')}</th><th>N i</th><th>M i</th><th>M j</th></tr></thead>
    <tbody>
      {#each st.bars as b (b.elementId)}
        <tr><td>{b.elementId}</td><td>{num(b.ends.nStart)}</td><td>{num(b.ends.mStart)}</td><td>{num(b.ends.mEnd)}</td></tr>
      {/each}
    </tbody>
  </table>
{/snippet}

{#if step === 1}
  <p class="fm-exp">{@html t('fm.s1.explanation')}</p>
  <table class="fm-table fm-count" data-testid="fm-count">
    <tbody>
      <tr><th>{t('fm.s1.reactions')}</th><td>{c.reactions}</td></tr>
      {#if c.springs > 0}<tr><th>{t('fm.s1.springs')}</th><td>{c.springs}</td></tr>{/if}
      <tr><th>{t('fm.s1.bars')}</th><td>{c.barUnknowns}</td></tr>
      <tr class="fm-sum"><th>Σ</th><td>{unknowns}</td></tr>
      <tr><th>{t('fm.s1.equations')}</th><td>{c.equations}</td></tr>
    </tbody>
  </table>
  <p class="fm-note">{t('fm.s1.barsNote')}</p>
  <p class="fm-note">{t('fm.s1.equationsNote')}</p>
  <p class="fm-result" data-testid="fm-gh">GH = {unknowns} − {c.equations} = <strong>{c.gh}</strong></p>
  <FmSketch geometry={r.original} />
  {#if r.isostatic}
    <p class="fm-exp">{t('fm.s1.iso')}</p>
    <FmSketch geometry={r.original} state={r.final} stateLabel="M" testId="fm-iso-diagram" />
  {:else}
    <p class="fm-exp">{t('fm.s1.hyper').replaceAll('{gh}', String(c.gh))}</p>
  {/if}
{:else if step === 2}
  <p class="fm-exp">{@html t('fm.s2.explanation')}</p>
  <h5 class="fm-h">{t('fm.s2.original')}</h5>
  <FmSketch geometry={r.original} />
  <h5 class="fm-h">{t('fm.s2.primary')}</h5>
  <FmSketch geometry={r.primary} redundants={r.redundants} testId="fm-primary" />
  <h5 class="fm-h">{t('fm.s2.list')}</h5>
  <ol class="fm-xlist" data-testid="fm-redundants">
    {#each r.redundants as x (x.index)}
      <li>
        <strong>{xName(x.index)}</strong> — {redundantText(x, r.original)}
        {#if x.prescribed}<br /><span class="fm-note">{t('fm.s2.prescribed').replace('{d}', String(x.prescribed))}</span>{/if}
      </li>
    {/each}
  </ol>
  <p class="fm-note">{t('fm.s2.why')}</p>
{:else if step === 3}
  <p class="fm-exp">{t('fm.s3.explanation')}</p>
  <!-- In state 0 the Xᵢ are not acting: they are drawn, faded, to say where they will. -->
  <FmSketch geometry={r.primary} redundants={r.redundants} focus={0} state={r.states[0]} stateLabel="M{sub(0)}" testId="fm-state0" />
  <p class="fm-note">{t('fm.s3.drawn')}</p>
  {@render stateTables(r.states[0])}
{:else if step === 4}
  <p class="fm-exp">{t('fm.s4.explanation')}</p>
  <div class="fm-pick" role="group">
    {#each r.redundants as x (x.index)}
      <button class="fm-chip" class:on={fmStepsStore.selectedState === x.index}
        onclick={() => fmStepsStore.selectState(x.index)} data-testid="fm-state-{x.index}">{xName(x.index)} = 1</button>
    {/each}
  </div>
  <p class="fm-note">{redundantText(r.redundants[k - 1], r.original)}</p>
  <FmSketch geometry={r.primary} redundants={r.redundants} focus={k} state={r.states[k]} stateLabel="m{sub(k)}" testId="fm-unit-state" />
  <p class="fm-note">{t('fm.s3.drawn')}</p>
  {@render stateTables(r.states[k])}
{/if}

<style>
  .fm-exp { font-size: 0.72rem; line-height: 1.5; color: var(--st-text-2); margin: 0 0 6px; }
  .fm-note { font-size: 0.64rem; line-height: 1.45; color: var(--st-text-3); margin: 2px 0 6px; }
  .fm-h { margin: 8px 0 2px; font-size: 0.62rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--st-text-3); }
  .fm-table { width: 100%; border-collapse: collapse; font-size: 0.68rem; font-variant-numeric: tabular-nums; }
  .fm-table th { text-align: left; font-weight: 400; color: var(--st-text-3); padding: 2px 6px 2px 0; }
  .fm-table td { text-align: right; padding: 2px 0 2px 8px; color: var(--st-text); white-space: nowrap; }
  .fm-table thead th { text-align: right; font-size: 0.6rem; }
  .fm-table thead th:first-child { text-align: left; }
  .fm-table td:first-child { text-align: left; padding-left: 0; }
  .fm-count th { width: 70%; }
  .fm-sum th, .fm-sum td { border-top: 1px solid var(--st-hair); font-weight: 600; }
  .fm-result { font-size: 0.85rem; margin: 6px 0; font-variant-numeric: tabular-nums; }
  .fm-result strong { color: var(--st-accent); }
  .fm-xlist { margin: 2px 0 6px; padding-left: 1rem; font-size: 0.7rem; line-height: 1.5; }
  .fm-pick { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; }
  .fm-chip {
    padding: 2px 8px; border: 1px solid var(--st-hair); border-radius: 10px; background: transparent;
    color: var(--st-text-3); font-size: 0.66rem; cursor: pointer; font-family: inherit;
  }
  .fm-chip.on { border-color: var(--st-accent); color: var(--st-accent); }
</style>
