<script lang="ts">
  /**
   * How P-Δ and the critical load are calculated in the plane: under the two buttons, closed by
   * default, its summary on the one line it takes. Each choice has its own ? with what it means.
   */
  import { t, tp } from '../../lib/i18n';
  import { secondOrderSettings } from '../../lib/store/second-order.svelte';
  import { ELEMENT_COUNTS, MAX_MODES, type SoMethod } from '../../lib/engine/second-order/settings';
  import { openSecondOrderSteps } from '../../lib/actions/second-order';

  const K = 'course.second-order.opts';
  const METHODS: SoMethod[] = ['consistent', 'string', 'phi'];

  let { onchange }: { onchange?: () => void } = $props();
  let open = $state(false);
  let help = $state<string | null>(null);
  const s = $derived(secondOrderSettings.value);

  const summary = $derived(
    [t(`${K}.short.${s.method}`), tp(`${K}.short.n`, { n: s.n }), t(`${K}.short.${s.axialRigid ? 'rigid' : 'elastic'}`)].join(' · '),
  );

  const toggle = (k: string) => { help = help === k ? null : k; };
  /** A change re-runs the analysis on screen, so the result always says how it was calculated. */
  function apply(patch: Parameters<typeof secondOrderSettings.set>[0]) {
    secondOrderSettings.set(patch);
    onchange?.();
  }
  const stepsDoc = $derived(s.method === 'phi' ? 'so-pdelta-phi' : 'so-pdelta-kg');
</script>

<div class="so" style="grid-column: span 2" data-testid="so-options">
  <button class="so-head" aria-expanded={open} onclick={() => (open = !open)} data-testid="so-options-toggle">
    <span class="so-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
    <span class="so-title">{t(`${K}.title`)}</span>
    <span class="so-sum">{summary}</span>
  </button>
  {#if open}
    <div class="so-body">
      <div class="so-row">
        <label class="so-label" for="so-method">{t(`${K}.method`)}</label>
        <button class="so-q" class:on={help === 'method'} onclick={() => toggle('method')} aria-expanded={help === 'method'}>?</button>
      </div>
      <select id="so-method" class="so-select" value={s.method} data-testid="so-method"
        onchange={(e) => apply({ method: (e.currentTarget as HTMLSelectElement).value as SoMethod })}>
        {#each METHODS as m (m)}<option value={m}>{t(`${K}.method.${m}`)}</option>{/each}
      </select>
      {#if help === 'method'}<p class="so-help">{t(`${K}.help.method`)}</p>{/if}

      <div class="so-row">
        <span class="so-label">{t(`${K}.n`)}</span>
        <button class="so-q" class:on={help === 'n'} onclick={() => toggle('n')} aria-expanded={help === 'n'}>?</button>
      </div>
      <div class="so-seg" role="group" aria-label={t(`${K}.n`)}>
        {#each ELEMENT_COUNTS as n (n)}
          <button class:on={s.n === n} aria-pressed={s.n === n} onclick={() => apply({ n })} data-testid={`so-n-${n}`}>{n}</button>
        {/each}
      </div>
      {#if s.n === 1 && s.method !== 'phi'}<p class="so-warn" data-testid="so-n1-warning">{t(`${K}.n1Warn`)}</p>{/if}
      {#if help === 'n'}<p class="so-help">{t(`${K}.help.n`)}</p>{/if}

      <div class="so-row">
        <span class="so-label">{t(`${K}.axial`)}</span>
        <button class="so-q" class:on={help === 'axial'} onclick={() => toggle('axial')} aria-expanded={help === 'axial'}>?</button>
      </div>
      <div class="so-seg two" role="group" aria-label={t(`${K}.axial`)}>
        <button class:on={!s.axialRigid} aria-pressed={!s.axialRigid} onclick={() => apply({ axialRigid: false })} data-testid="so-axial-elastic">{t(`${K}.axial.elastic`)}</button>
        <button class:on={s.axialRigid} aria-pressed={s.axialRigid} onclick={() => apply({ axialRigid: true })} data-testid="so-axial-rigid">{t(`${K}.axial.rigid`)}</button>
      </div>
      {#if help === 'axial'}<p class="so-help">{t(`${K}.help.axial`)}</p>{/if}

      <div class="so-row">
        <label class="so-label" for="so-modes">{t(`${K}.modes`)}</label>
        <input id="so-modes" class="so-num" type="number" min="1" max={MAX_MODES} step="1" value={s.modes} data-testid="so-modes"
          onchange={(e) => apply({ modes: Number((e.currentTarget as HTMLInputElement).value) })} />
        <button class="so-q" class:on={help === 'modes'} onclick={() => toggle('modes')} aria-expanded={help === 'modes'}>?</button>
      </div>
      {#if help === 'modes'}<p class="so-help">{t(`${K}.help.modes`)}</p>{/if}

      <p class="so-engine">{t(s.method === 'consistent' && !s.axialRigid ? `${K}.byEngine` : `${K}.byTeaching`)}</p>
      <button class="so-steps" onclick={() => openSecondOrderSteps(stepsDoc, s)} data-testid="so-open-steps">{t(`${K}.steps`)}</button>
    </div>
  {/if}
</div>

<style>
  .so { border: 1px solid var(--st-hair); border-radius: 6px; background: var(--st-surface); }
  .so-head {
    display: flex; align-items: baseline; gap: 0.35rem; width: 100%; padding: 0.3rem 0.45rem;
    background: none; border: none; color: var(--st-text); cursor: pointer; text-align: left; font-size: 0.7rem;
  }
  .so-caret { color: var(--st-text-3); width: 0.7rem; flex: none; }
  .so-title { font-weight: 600; flex: none; }
  .so-sum { color: var(--st-text-3); font-size: 0.64rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .so-body { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.1rem 0.5rem 0.5rem; }
  .so-row { display: flex; align-items: center; gap: 0.35rem; margin-top: 0.2rem; }
  .so-label { flex: 1; font-size: 0.68rem; color: var(--st-text-2); }
  .so-q {
    width: 18px; height: 18px; flex: none; border-radius: 50%; padding: 0; cursor: pointer; font-size: 0.62rem; font-weight: 700;
    border: 1px solid var(--st-hair-strong); background: var(--st-surface-2); color: var(--st-text-2);
  }
  .so-q.on { background: var(--st-accent); border-color: var(--st-accent); color: var(--st-text-on-accent); }
  .so-select, .so-num {
    padding: 0.25rem 0.35rem; border: 1px solid var(--st-hair-strong); border-radius: 4px;
    background: var(--st-surface-2); color: var(--st-value); font-size: 0.7rem;
  }
  .so-select { width: 100%; }
  .so-num { width: 3.6rem; }
  .so-seg { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; }
  .so-seg.two { grid-template-columns: 1fr 1fr; }
  .so-seg button {
    padding: 0.25rem 0.2rem; border: 1px solid var(--st-hair-strong); border-radius: 4px; cursor: pointer;
    background: var(--st-surface-2); color: var(--st-text-2); font-size: 0.68rem; line-height: 1.2;
  }
  .so-seg button.on { background: var(--st-accent); border-color: var(--st-accent); color: var(--st-text-on-accent); }
  .so-help { margin: 0.1rem 0 0.2rem; font-size: 0.66rem; line-height: 1.4; color: var(--st-text-2); }
  .so-warn { margin: 0.1rem 0; font-size: 0.64rem; line-height: 1.35; color: var(--st-amber-text); }
  .so-engine { margin: 0.3rem 0 0; font-size: 0.62rem; color: var(--st-text-3); line-height: 1.35; }
  .so-steps {
    align-self: flex-start; margin-top: 0.2rem; padding: 0.25rem 0.55rem; border-radius: 4px; cursor: pointer; font-size: 0.68rem;
    border: 1px solid var(--st-hair-strong); background: var(--st-surface-2); color: var(--st-text);
  }
  .so-steps:hover { background: var(--st-surface-3); }
  @media (pointer: coarse) { .so-seg button, .so-steps { min-height: 34px; } .so-q { width: 28px; height: 28px; } }
</style>
