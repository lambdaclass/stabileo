<script lang="ts">
  /**
   * Self-weight as loads inside cases, written on the model (`analysis.selfWeight`). How
   * combinations are formed and solved is in Specifications › Analysis. Every change is one undo
   * step and retires the results on hand.
   *
   * One row, closed, saying where the weight goes; open, the rows that put it there. A project
   * that has not written its rule yet (`selfWeight` absent) still runs on the older switch, which
   * adds the weight to the dead-load cases; it is offered here in the same place, and adding a
   * row writes the rule.
   */
  import { t, tp } from '../../lib/i18n';
  import { modelStore, uiStore } from '../../lib/store';
  import type { SelfWeightLoad, GlobalAxis } from '../../lib/engine/analysis-settings';
  import { GRAVITY_SELF_WEIGHT } from '../../lib/engine/analysis-settings';

  let open = $state(false);
  const written = $derived(modelStore.analysis?.selfWeight !== undefined);
  const weights = $derived(modelStore.analysis?.selfWeight ?? []);
  const cases = $derived(modelStore.model.loadCases);
  const groups = $derived([...modelStore.model.groups.values()]);

  const summary = $derived.by(() => {
    if (!written) return uiStore.includeSelfWeight ? t('selfWeight.summaryLegacy') : t('selfWeight.summaryNone');
    if (weights.length === 0) return t('selfWeight.summaryNone');
    if (weights.length > 1) return tp('selfWeight.summaryMany', { n: weights.length });
    const w = weights[0]!;
    const c = cases.find((x) => x.id === w.caseId);
    return tp('selfWeight.summaryOne', { case: c ? `${c.type ? `${c.type} · ` : ''}${c.name}` : '?', f: String(w.factor).replace('-', '−'), dir: w.direction });
  });

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

<div class="sw" class:open data-testid="analysis-rules">
  <button type="button" class="sw-head" aria-expanded={open} onclick={() => (open = !open)} data-testid="sw-toggle">
    <span class="sw-chev" aria-hidden="true">▸</span>
    <span class="sw-title">{t('selfWeight.title')}</span>
    <span class="sw-summary" data-testid="sw-summary">{summary}</span>
  </button>
  {#if open}
    <div class="sw-body">
      {#if !written}
        <label class="pk-check" data-testid="sw-legacy">
          <input type="checkbox" bind:checked={uiStore.includeSelfWeight} />
          {t('selfWeight.legacy')}
        </label>
      {:else if weights.length === 0}
        <p class="pk-hint" data-testid="sw-none">{t('selfWeight.none')}</p>
      {/if}
      {#if weights.length > 0}
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
                <td><button class="sw-x" onclick={() => write(weights.filter((_, k) => k !== i))} aria-label={t('selfWeight.remove')} title={t('selfWeight.remove')}>×</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
      <div class="pk-row">
        <button class="pk-btn" onclick={add} disabled={cases.length === 0} data-testid="sw-add">+ {t('selfWeight.add')}</button>
      </div>
      <p class="pk-hint">{t('selfWeight.help')}</p>
    </div>
  {/if}
</div>

<style>
  .sw { margin: 6px 0; border: 1px solid var(--st-hair); border-radius: var(--st-radius); background: var(--st-surface-2); font-size: 0.7rem; color: var(--st-text-2); }
  .sw-head {
    display: flex; align-items: center; gap: 6px; width: 100%;
    padding: 5px 8px; background: none; border: none; color: inherit; font: inherit; cursor: pointer; text-align: left;
  }
  .sw-head:hover { color: var(--st-text); }
  .sw-head:focus-visible { outline: 2px solid var(--st-interactive); outline-offset: -2px; }
  .sw-chev { display: inline-block; font-size: 0.8rem; line-height: 1; color: var(--st-text-3); transition: transform 0.12s; }
  .sw.open .sw-chev { transform: rotate(90deg); }
  .sw-title { color: var(--st-text); font-weight: 600; }
  .sw-summary { margin-left: auto; color: var(--st-text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .sw-body { display: flex; flex-direction: column; gap: 6px; padding: 2px 8px 8px; border-top: 1px solid var(--st-hair); padding-top: 6px; }
  .sw-table { width: 100%; border-collapse: collapse; }
  .sw-table th { text-align: left; color: var(--st-text-3); font-weight: normal; padding: 1px 3px; font-size: 0.64rem; }
  .sw-table td { padding: 1px 3px; }
  .num { width: 4rem; text-align: right; }
  .sw-x { background: none; border: none; color: var(--st-text-3); font-size: 0.9rem; cursor: pointer; padding: 0; }
  .sw-x:hover { color: var(--st-danger); }
</style>
