<script lang="ts">
  /**
   * What the open method computes, above its document: a closed box with a
   * one-line summary that opens into the choices (the quantity, its node or
   * nodes, a direction), with a ? that says what each choice does.
   */
  import { t } from '../../lib/i18n';
  import { explainedSteps } from '../../lib/store/explained-steps.svelte';
  import { modelStore, uiStore } from '../../lib/store';
  import { methodById } from '../../lib/engine/steps/methods';
  import { planeModel } from '../../lib/engine/steps/plane-model';
  import type { MethodParam } from '../../lib/engine/steps/registry';
  import Prose from './Prose.svelte';

  const method = $derived(explainedSteps.methodId ? methodById(explainedSteps.methodId) : undefined);
  const values = $derived(explainedSteps.params);
  const nodes = $derived.by(() => {
    void modelStore.modelVersion;
    const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
    if (!input) return [];
    const pm = planeModel(input);
    return pm.nodeOrder.map((id) => ({ id: String(id), name: pm.nodes.get(id)!.name }));
  });
  const visible = (q: MethodParam) => (q.when ?? []).every((c) => c.in.includes(values[c.id] ?? ''));
  const shown = $derived((method?.params ?? []).filter(visible));
  let help = $state(false);

  function text(q: MethodParam): string {
    const v = values[q.id] ?? q.default;
    if (q.kind === 'node') return v ? (nodes.find((n) => n.id === v)?.name ?? v) : t('course.statics.vw.p.nodeAuto');
    if (q.kind === 'number') return `${v}°`;
    return t(`${q.labelKey}.${v}`);
  }
  const summary = $derived(shown.map(text).join(' · '));
</script>

{#if method?.params?.length && explainedSteps.doc && !explainedSteps.doc.noParams}
  <details class="sp" data-testid="steps-params">
    <summary><span class="sp-lead">{t('course.statics.vw.p.title')}</span> <span class="sp-sum">{summary}</span></summary>
    {#each shown as q (q.id)}
      <label class="sp-row">
        <span>{t(q.labelKey)}</span>
        {#if q.kind === 'select'}
          <select value={values[q.id]} onchange={(e) => explainedSteps.setParam(q.id, e.currentTarget.value)} data-testid="steps-param-{q.id}">
            {#each q.values ?? [] as v (v)}<option value={v}>{t(`${q.labelKey}.${v}`)}</option>{/each}
          </select>
        {:else if q.kind === 'node'}
          <select value={values[q.id]} onchange={(e) => explainedSteps.setParam(q.id, e.currentTarget.value)} data-testid="steps-param-{q.id}">
            <option value="">{t('course.statics.vw.p.nodeAuto')}</option>
            {#each nodes as n (n.id)}<option value={n.id}>{n.name}</option>{/each}
          </select>
        {:else}
          <input type="number" step="15" value={values[q.id]} data-testid="steps-param-{q.id}"
            onchange={(e) => explainedSteps.setParam(q.id, e.currentTarget.value)} />
        {/if}
      </label>
    {/each}
    <div class="sp-foot">
      <button class="sp-help" class:on={help} onclick={() => (help = !help)} aria-expanded={help} title={t('steps.catalog.help')}>?</button>
    </div>
    {#if help}<p class="sp-text"><Prose text={t('course.statics.vw.p.help')} /></p>{/if}
  </details>
{/if}

<style>
  .sp { margin: 0.2rem 0.75rem 0.3rem; padding: 0.3rem 0.5rem; border: 1px solid var(--st-hair); border-radius: var(--st-radius); flex: none; }
  .sp summary { cursor: pointer; font-size: 0.76rem; color: var(--st-text); list-style-position: inside; }
  .sp-lead { font-weight: 600; }
  .sp-sum { color: var(--st-text-2); }
  .sp-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; font-size: 0.74rem; color: var(--st-text-2); margin-top: 0.3rem; }
  .sp-row select, .sp-row input {
    flex: 0 1 60%; min-width: 0; font-size: 0.74rem; padding: 2px 4px; font-family: inherit;
    background: var(--st-surface-2); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 4px;
  }
  .sp-foot { display: flex; justify-content: flex-end; margin-top: 0.3rem; }
  .sp-help {
    width: 20px; height: 20px; flex: none; border-radius: 50%; cursor: pointer; font-size: 0.68rem; font-weight: 700;
    border: 1px solid var(--st-hair-strong); background: var(--st-surface-2); color: var(--st-text-2);
  }
  .sp-help.on { background: var(--st-accent); border-color: var(--st-accent); color: #fff; }
  .sp-text { margin: 0.25rem 0 0.1rem; font-size: 0.74rem; line-height: 1.45; color: var(--st-text-2); }
  @media (pointer: coarse) { .sp-help { width: 28px; height: 28px; } .sp-row select, .sp-row input { min-height: 32px; } }
</style>
