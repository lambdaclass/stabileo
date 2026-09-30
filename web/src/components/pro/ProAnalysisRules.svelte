<script lang="ts">
  /**
   * The project's analysis rules, written on the model (`analysis`): self-weight as loads inside
   * cases, how combinations with one-way behaviour are formed, and linear or P-Delta per
   * combination. Every change is one undo step and retires the results on hand.
   */
  import { t } from '../../lib/i18n';
  import { modelStore, uiStore } from '../../lib/store';
  import type { SelfWeightLoad, GlobalAxis } from '../../lib/engine/analysis-settings';
  import { GRAVITY_SELF_WEIGHT } from '../../lib/engine/analysis-settings';

  const weights = $derived(modelStore.analysis?.selfWeight ?? []);
  const cases = $derived(modelStore.model.loadCases);
  const groups = $derived([...modelStore.model.groups.values()]);
  const method = $derived(modelStore.analysis?.combinationMethod ?? 'solveEach');
  const perCombination = $derived(modelStore.analysis?.perCombination ?? 'linear');
  const oneWay = $derived([...modelStore.elements.values()].some((e) => e.behaviour === 'tensionOnly' || e.behaviour === 'compressionOnly')
    || [...modelStore.supports.values()].some((s) => s.uplift));

  function write(next: SelfWeightLoad[]) { modelStore.setAnalysis({ selfWeight: next }); }
  function add() {
    const dead = cases.find((c) => c.type === 'D') ?? cases[0];
    if (!dead) return;
    write([...weights, { caseId: dead.id, ...GRAVITY_SELF_WEIGHT }]);
  }
  function change(i: number, patch: Partial<SelfWeightLoad>) {
    write(weights.map((w, k) => {
      if (k !== i) return w;
      const next = { ...w, ...patch };
      for (const key of Object.keys(patch) as Array<keyof SelfWeightLoad>) if (patch[key] === undefined) delete next[key];
      return next;
    }));
  }
  function scopeValue(w: SelfWeightLoad) { return w.groupId !== undefined ? `g${w.groupId}` : w.elements ? 'list' : 'all'; }
  function setScope(i: number, v: string) {
    if (v === 'all') change(i, { groupId: undefined, elements: undefined });
    else if (v === 'list') change(i, { groupId: undefined, elements: [...uiStore.selectedElements] });
    else change(i, { elements: undefined, groupId: Number(v.slice(1)) });
  }
</script>

<div class="rules" data-testid="analysis-rules">
  <div class="block">
    <div class="head">
      <span class="title">{t('selfWeight.title')}</span>
      <button class="pro-btn" onclick={add} disabled={cases.length === 0} data-testid="sw-add">+ {t('selfWeight.add')}</button>
    </div>
    {#if weights.length === 0}
      <p class="note" data-testid="sw-none">{t('selfWeight.none')}</p>
    {:else}
      <table class="sw-table">
        <thead><tr><th>{t('pro.lcName')}</th><th>{t('selfWeight.direction')}</th><th>{t('selfWeight.factor')}</th><th>{t('selfWeight.scope')}</th><th></th></tr></thead>
        <tbody>
          {#each weights as w, i (i)}
            <tr data-testid="sw-row">
              <td>
                <select value={String(w.caseId)} onchange={(e) => change(i, { caseId: Number(e.currentTarget.value) })} data-testid="sw-case">
                  {#each cases as c (c.id)}<option value={String(c.id)}>{c.type ? `${c.type} · ` : ''}{c.name}</option>{/each}
                </select>
              </td>
              <td>
                <select value={w.direction} onchange={(e) => change(i, { direction: e.currentTarget.value as GlobalAxis })}>
                  <option value="X">X</option><option value="Y">Y</option><option value="Z">Z</option>
                </select>
              </td>
              <td><input type="number" step="0.1" value={w.factor} class="num" onchange={(e) => { const v = Number(e.currentTarget.value); if (Number.isFinite(v)) change(i, { factor: v }); }} data-testid="sw-factor" /></td>
              <td>
                <select value={scopeValue(w)} onchange={(e) => setScope(i, e.currentTarget.value)} title={w.elements ? t('selfWeight.listTitle').replace('{n}', String(w.elements.length)) : ''}>
                  <option value="all">{t('selfWeight.scopeAll')}</option>
                  <option value="list" disabled={!w.elements && uiStore.selectedElements.size === 0}>{w.elements ? t('selfWeight.scopeList').replace('{n}', String(w.elements.length)) : t('selfWeight.scopeSelection').replace('{n}', String(uiStore.selectedElements.size))}</option>
                  {#each groups as g (g.id)}<option value={`g${g.id}`}>{g.name}</option>{/each}
                </select>
              </td>
              <td><button class="pro-delete-btn" onclick={() => write(weights.filter((_, k) => k !== i))} aria-label={t('selfWeight.remove')}>×</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
    <p class="note">{t('selfWeight.help')}</p>
  </div>

  <div class="block">
    <span class="title">{t('analysisRules.combinations')}</span>
    <label class="row">
      <input type="radio" name="combo-method" checked={method === 'solveEach'} onchange={() => modelStore.setAnalysis({ combinationMethod: undefined })} data-testid="combo-solve-each" />
      {t('analysisRules.solveEach')}
    </label>
    <label class="row">
      <input type="radio" name="combo-method" checked={method === 'superpose'} onchange={() => modelStore.setAnalysis({ combinationMethod: 'superpose' })} data-testid="combo-superpose" />
      {t('analysisRules.superpose')}
    </label>
    {#if !oneWay}<p class="note">{t('analysisRules.methodLinear')}</p>{/if}
    <label class="row">
      {t('analysisRules.perCombination')}
      <select value={perCombination} onchange={(e) => modelStore.setAnalysis({ perCombination: e.currentTarget.value === 'pdelta' ? 'pdelta' : undefined })} data-testid="per-combination">
        <option value="linear">{t('analysisRules.linear')}</option>
        <option value="pdelta">{t('analysisRules.pdelta')}</option>
      </select>
    </label>
    {#if perCombination === 'pdelta' && oneWay}<p class="note warn">{t('analysisRules.pdeltaOneWay')}</p>{/if}
  </div>
</div>

<style>
  .rules { display: flex; flex-direction: column; gap: 8px; font-size: 0.68rem; color: var(--st-text-2); }
  .block { display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--st-hair); border-radius: 4px; padding: 6px; }
  .head { display: flex; align-items: center; justify-content: space-between; }
  .title { color: var(--st-text); font-weight: 600; }
  .row { display: flex; align-items: center; gap: 6px; }
  .sw-table { width: 100%; border-collapse: collapse; }
  .sw-table th { text-align: left; color: var(--st-text-3); font-weight: normal; padding: 1px 3px; }
  .sw-table td { padding: 1px 3px; }
  select, input { background: var(--st-bg); color: var(--st-text); border: 1px solid var(--st-surface-3); border-radius: 3px; padding: 1px 4px; font-size: 0.66rem; }
  .num { width: 4rem; text-align: right; }
  .note { margin: 0; font-size: 0.64rem; color: var(--st-text-3); line-height: 1.35; }
  .note.warn { color: var(--st-warn); }
</style>
