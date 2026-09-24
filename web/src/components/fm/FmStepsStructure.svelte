<script lang="ts">
  /**
   * Steps 1–4 of the flexibility method: the count, the primary structure,
   * and the states solved on it. Every state is drawn, because the method is
   * learnt from the diagrams — the numbers under them are for checking.
   *
   * An isostatic structure walks through too: each step says what having no
   * redundants means for it, instead of the wizard stopping at Step 1 as if
   * something had broken.
   */
  import { t } from '../../lib/i18n';
  import { fmStepsStore } from '../../lib/store';
  import type { ForceMethodResult, StateResult } from '../../lib/engine/force-method/solve';
  import FmSketch from './FmSketch.svelte';
  import FmDiagramPicker from './FmDiagramPicker.svelte';
  import { redundantText, xName, num, componentName, sub } from './fm-text';

  let { r, step }: { r: ForceMethodResult; step: number } = $props();

  const c = $derived(r.count);
  const is3D = $derived(!!r.is3D);
  const unknowns = $derived(c.reactions + c.springs + c.barUnknowns);
  /** The unit state on screen, clamped to the redundants there are. */
  const k = $derived(Math.min(Math.max(fmStepsStore.selectedState, 1), Math.max(r.redundants.length, 1)));
  const rotated = (nodeId: number) =>
    r.original.supports.some((s) => s.nodeId === nodeId && (s.angle !== undefined
      || (is3D && s.restrained[0] && !s.restrained[1] && !s.restrained[2])));
  const comp = $derived(fmStepsStore.diagramComponent);
  const compLabel = (base: string) => (comp === 'my' ? `My${base}` : comp === 't' ? `T${base}` : comp === 'n' ? `N${base}` : `M${base}`);
</script>

{#snippet stateTables(st: StateResult)}
  <h5 class="fm-h">{t('fm.s3.reactions')}</h5>
  <table class="fm-table" data-testid="fm-reactions">
    <thead><tr><th>{t('fm.s3.node')}</th><th></th><th>kN · kN·m</th></tr></thead>
    <tbody>
      {#each st.reactions.filter((q) => Math.abs(q.value) > 1e-9) as q (q.nodeId + ':' + q.component)}
        <tr><td>{q.nodeId}</td><td>{componentName(q.component, rotated(q.nodeId), is3D)}</td><td>{num(q.value)}</td></tr>
      {/each}
    </tbody>
  </table>
  <h5 class="fm-h">{t('fm.s3.endMoments')}</h5>
  <div class="fm-scroll">
    <table class="fm-table">
      <thead>
        <tr>
          <th>{t('fm.s3.bar')}</th><th>N i</th>
          {#if is3D}<th>Mz i</th><th>Mz j</th><th>My i</th><th>My j</th><th>T</th>{:else}<th>M i</th><th>M j</th>{/if}
        </tr>
      </thead>
      <tbody>
        {#each st.bars as b (b.elementId)}
          <tr>
            <td>{b.elementId}</td><td>{num(b.ends.nStart)}</td><td>{num(b.ends.mStart)}</td><td>{num(b.ends.mEnd)}</td>
            {#if is3D}<td>{num(b.ends.myStart ?? 0)}</td><td>{num(b.ends.myEnd ?? 0)}</td><td>{num(b.ends.tStart ?? 0)}</td>{/if}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
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
  <p class="fm-note">{t(is3D ? 'fm.s1.barsNote3d' : 'fm.s1.barsNote')}</p>
  <p class="fm-note">{t(is3D ? 'fm.s1.equationsNote3d' : 'fm.s1.equationsNote')}</p>
  <p class="fm-result" data-testid="fm-gh">GH = {unknowns} − {c.equations} = <strong>{c.gh}</strong></p>
  <FmSketch geometry={r.original} />
  <p class="fm-exp">{r.isostatic ? t('fm.s1.iso') : t('fm.s1.hyper').replaceAll('{gh}', String(c.gh))}</p>
{:else if step === 2}
  <p class="fm-exp">{@html t('fm.s2.explanation')}</p>
  {#if r.isostatic}
    <p class="fm-exp fm-iso" data-testid="fm-iso-note">{t('fm.iso.s2')}</p>
    <FmSketch geometry={r.original} testId="fm-primary" />
  {:else}
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
  {/if}
{:else if step === 3}
  <p class="fm-exp">{t('fm.s3.explanation')}</p>
  {#if r.isostatic}<p class="fm-exp fm-iso">{t('fm.iso.s3')}</p>{/if}
  <FmDiagramPicker {is3D} />
  <!-- In state 0 the Xᵢ are not acting: they are drawn, faded, to say where they will. -->
  <FmSketch geometry={r.primary} redundants={r.redundants} focus={0} state={r.states[0]}
    component={comp} stateLabel={compLabel(sub(0))} testId="fm-state0" />
  <p class="fm-note">{t('fm.s3.drawn')}</p>
  {@render stateTables(r.states[0])}
{:else if step === 4}
  <p class="fm-exp">{t('fm.s4.explanation')}</p>
  {#if r.isostatic}
    <p class="fm-exp fm-iso" data-testid="fm-iso-note">{t('fm.iso.none')}</p>
  {:else}
    <div class="fm-pick" role="group">
      {#each r.redundants as x (x.index)}
        <button class="fm-chip" class:on={fmStepsStore.selectedState === x.index}
          onclick={() => fmStepsStore.selectState(x.index)} data-testid="fm-state-{x.index}">{xName(x.index)} = 1</button>
      {/each}
    </div>
    <p class="fm-note">{redundantText(r.redundants[k - 1], r.original)}</p>
    <FmDiagramPicker {is3D} />
    <FmSketch geometry={r.primary} redundants={r.redundants} focus={k} state={r.states[k]}
      component={comp} stateLabel={compLabel(sub(k)).replace('M', 'm')} testId="fm-unit-state" />
    <p class="fm-note">{t('fm.s3.drawn')}</p>
    {@render stateTables(r.states[k])}
  {/if}
{/if}

<style>
  .fm-exp { font-size: 0.72rem; line-height: 1.5; color: var(--st-text-2); margin: 0 0 6px; }
  .fm-iso { border-left: 2px solid var(--st-accent); padding-left: 6px; }
  .fm-note { font-size: 0.64rem; line-height: 1.45; color: var(--st-text-3); margin: 2px 0 6px; }
  .fm-h { margin: 8px 0 2px; font-size: 0.62rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--st-text-3); }
  .fm-scroll { overflow-x: auto; }
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
