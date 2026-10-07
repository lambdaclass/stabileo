<script lang="ts">
  /**
   * Specifications › Members › Variable section: a section at end J beside the member's own at end
   * I, and the transition between them as geometry (`section/variable.ts`). The solve cuts the
   * member into prismatic pieces and reports it as one (`engine/variable-members.ts`).
   *
   * What it shows is what the analysis will use: whether the two sections blend, how, and the
   * area and inertias at the ends and the middle.
   */
  import { modelStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { variableSectionPlan } from '../../../lib/section/variable';
  import { DEFAULT_VARIABLE_SEGMENTS } from '../../../lib/engine/variable-members';
  import type { Element } from '../../../lib/store/model.svelte';

  interface Props { ids: number[] }
  const { ids }: Props = $props();

  const members = $derived(ids.map((id) => modelStore.elements.get(id)).filter(Boolean) as Element[]);
  const same = <T,>(f: (e: Element) => T): T | undefined => {
    const v = members.map(f);
    return v.length && v.every((x) => JSON.stringify(x) === JSON.stringify(v[0])) ? v[0] : undefined;
  };
  const on = $derived(same((e) => !!e.variableSection));
  const sectionJ = $derived(same((e) => e.variableSection?.sectionJ ?? null));
  const segments = $derived(same((e) => e.variableSection?.segments ?? DEFAULT_VARIABLE_SEGMENTS));
  const sectionI = $derived(same((e) => e.sectionId));
  const frames = $derived(members.every((e) => (e.type ?? 'frame') === 'frame' && (!(e as { behaviour?: string }).behaviour || (e as { behaviour?: string }).behaviour === 'frame')));
  const sections = $derived([...modelStore.sections.values()].sort((a, b) => a.name.localeCompare(b.name)));

  function set(next: { sectionJ: number; segments?: number } | undefined) {
    modelStore.batch(() => { for (const e of members) modelStore.updateElement(e.id, { variableSection: next } as never); });
  }
  function toggle(v: boolean) {
    if (!v) { set(undefined); return; }
    // A first end J: another section than end I's, so the switch does something at once.
    const first = sections.find((s) => s.id !== sectionI) ?? sections[0];
    if (first) set({ sectionJ: first.id });
  }
  /** One member's plan, when the selection shares its two sections. */
  const plan = $derived(sectionI !== undefined && sectionJ != null
    ? variableSectionPlan(modelStore.sections.get(sectionI), modelStore.sections.get(sectionJ)) : null);
  const rows = $derived.by(() => {
    if (!plan?.ok) return [];
    const cm = (v: number | undefined, k: number) => (v === undefined ? '—' : (v * k).toFixed(k === 1e4 ? 1 : 0));
    return [0, 0.5, 1].map((x) => {
      const s = plan.at(x);
      return { x, name: x === 0.5 ? t('spec.variable.middle') : s.name, h: s.h, a: cm(s.a, 1e4), iy: cm(s.iy, 1e8), iz: cm(s.iz, 1e8) };
    });
  });
</script>

<label class="pk-row"><input type="checkbox" checked={!!on} indeterminate={on === undefined}
  disabled={!frames} onchange={(e) => toggle(e.currentTarget.checked)} data-testid="spec-variable" /> {t('spec.variable.toggle')}</label>
{#if !frames}
  <p class="pk-hint">{t('spec.variable.framesOnly')}</p>
{:else if on}
  <span class="pk-label">{tp('spec.variable.endI', { name: sectionI !== undefined ? modelStore.sections.get(sectionI)?.name ?? '—' : t('behaviour.mixed') })}</span>
  <label class="pk-row">{t('spec.variable.endJ')}
    <select value={sectionJ ?? ''} onchange={(e) => set({ sectionJ: Number(e.currentTarget.value), ...(segments !== undefined && segments !== DEFAULT_VARIABLE_SEGMENTS ? { segments } : {}) })} data-testid="spec-variable-j">
      {#if sectionJ === undefined}<option value="" disabled>{t('behaviour.mixed')}</option>{/if}
      {#each sections as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
    </select>
  </label>
  <label class="pk-row">{t('spec.variable.segments')}
    <input class="sv-num" type="number" min="2" max="50" step="1" value={segments ?? ''} placeholder={segments === undefined ? t('behaviour.mixed') : ''}
      onchange={(e) => { const n = Math.round(Number(e.currentTarget.value)); if (sectionJ != null && n >= 2 && n <= 50) set({ sectionJ, ...(n !== DEFAULT_VARIABLE_SEGMENTS ? { segments: n } : {}) }); else e.currentTarget.value = String(segments ?? ''); }}
      data-testid="spec-variable-segments" /></label>
  {#if plan && !plan.ok}
    <p class="pk-warn" data-testid="spec-variable-problem">{t(`spec.variable.problem.${plan.problem}`)}</p>
  {:else if plan?.ok}
    <p class="pk-hint" data-testid="spec-variable-mode">{t(`spec.variable.mode.${plan.mode}`)}</p>
    <table class="sv-table" data-testid="spec-variable-table">
      <thead><tr><th></th><th>h (mm)</th><th>A (cm²)</th><th>Iy (cm⁴)</th><th>Iz (cm⁴)</th></tr></thead>
      <tbody>
        {#each rows as r (r.x)}
          <tr><td>{r.name}</td><td>{r.h !== undefined ? (r.h * 1000).toFixed(0) : '—'}</td><td>{r.a}</td><td>{r.iy}</td><td>{r.iz}</td></tr>
        {/each}
      </tbody>
    </table>
  {/if}
  <p class="pk-hint">{t('spec.variable.hint')}</p>
{:else}
  <p class="pk-hint">{t('spec.variable.offHint')}</p>
{/if}

<style>
  .sv-num { width: 72px; }
  .sv-table { width: 100%; border-collapse: collapse; font-size: 0.66rem; font-variant-numeric: tabular-nums; }
  .sv-table th { text-align: right; font-weight: 500; color: var(--st-text-3); padding: 2px 4px; border-bottom: 1px solid var(--st-hair); }
  .sv-table td { text-align: right; padding: 2px 4px; color: var(--st-text-2); border-bottom: 1px solid var(--st-hair); }
  .sv-table th:first-child, .sv-table td:first-child { text-align: left; }
  .pk-warn { margin: 0; font-size: 0.66rem; color: var(--st-warn); line-height: 1.4; }
</style>
