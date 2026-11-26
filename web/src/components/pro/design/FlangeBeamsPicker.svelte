<script lang="ts">
  /**
   * The beams that take the slab as their flange: every beam, or a list built by typing their
   * names or from what is selected in the model, its entries ticked to be removed or shown.
   */
  import Hint from '../Hint.svelte';
  import { t, tp } from '../../../lib/i18n';
  import { modelStore, uiStore } from '../../../lib/store';
  import { designData } from '../../../lib/store/design-data';
  import { setFlangeBeams } from '../../../lib/store/rc-sheets.svelte';
  import { beamsByName, beamsHolding, parseBeamNames } from '../../../lib/rc-sheets/flange-beams';

  const listed = $derived.by(() => { void modelStore.designData; return designData().designOptions?.flangeBeams; });
  const beams = $derived.by(() => { void modelStore.model.groups; return beamsByName(modelStore.model.groups.values()); });
  const nameOf = (id: number) => beams.find((b) => b.id === id)?.name ?? `#${id}`;
  const levelOf = (id: number) => beams.find((b) => b.id === id)?.level ?? '';
  const inModel = $derived.by(() => { void uiStore.selectedElements; return beamsHolding(modelStore.model.groups.values(), uiStore.selectedElements).filter((id) => !listed?.includes(id)); });
  let typed = $state('');
  let unknown = $state<string[]>([]);
  let ticked = $state<Set<number>>(new Set());

  function add(ids: readonly number[]) { setFlangeBeams([...(listed ?? []), ...ids]); }
  function addTyped() {
    const r = parseBeamNames(typed, beams);
    if (r.ids.length) add(r.ids);
    unknown = r.unknown;
    if (!r.unknown.length) typed = '';
  }
  function removeTicked() { setFlangeBeams((listed ?? []).filter((id) => !ticked.has(id))); ticked = new Set(); }
  function toggle(id: number, on: boolean) { const next = new Set(ticked); if (on) next.add(id); else next.delete(id); ticked = next; }
  function showTicked() {
    const ids = [...(ticked.size ? ticked : new Set(listed ?? []))];
    uiStore.selectElements(ids.flatMap((g) => modelStore.model.groups.get(g)?.members.elements ?? []));
  }
</script>

<div class="fb" data-testid="dd-flange-beams">
  <div class="fb-seg" role="radiogroup" aria-label={t('rcSheets.opt.flange')}>
    <button type="button" role="radio" aria-checked={!listed} class:on={!listed} onclick={() => setFlangeBeams(null)} data-testid="dd-flange-all">{t('designData.flange.all')}</button>
    <button type="button" role="radio" aria-checked={!!listed} class:on={!!listed} onclick={() => { if (!listed) setFlangeBeams(inModel); }} data-testid="dd-flange-chosen">{t('designData.flange.chosen')}</button>
  </div>

  {#if listed}
    <form class="fb-add" onsubmit={(e) => { e.preventDefault(); addTyped(); }}>
      <input type="text" list="fb-names" bind:value={typed} placeholder={t('designData.flange.typePlaceholder')} aria-label={t('designData.flange.type')} data-testid="dd-flange-type" />
      <datalist id="fb-names">{#each beams.filter((b) => !listed.includes(b.id)) as b (b.id)}<option value={b.name}>{b.level}</option>{/each}</datalist>
      <button type="submit" disabled={!typed.trim()} data-testid="dd-flange-type-add">{t('designData.flange.add')}</button>
    </form>
    {#if unknown.length}<p class="fb-warn" data-testid="dd-flange-unknown">{tp('designData.flange.unknown', { names: unknown.join(', ') })}</p>{/if}

    {#if inModel.length}
      <div class="fb-sel" data-testid="dd-flange-selected">
        <span>{tp('designData.flange.selectedNow', { n: inModel.length })}</span>
        <span class="fb-names">{inModel.map(nameOf).join(', ')}</span>
        <button type="button" onclick={() => add(inModel)} data-testid="dd-flange-add">{t('designData.flange.addSelected')}</button>
      </div>
    {:else}
      <Hint text={t('designData.flange.selectHint')} />
    {/if}

    {#if listed.length}
      <div class="fb-tools">
        <label><input type="checkbox" checked={ticked.size === listed.length} indeterminate={ticked.size > 0 && ticked.size < listed.length} onchange={(e) => { ticked = e.currentTarget.checked ? new Set(listed) : new Set(); }} data-testid="dd-flange-tick-all" /> {tp('designData.flange.count', { n: listed.length })}</label>
        <button type="button" onclick={showTicked} data-testid="dd-flange-show">{t(ticked.size ? 'designData.flange.showTicked' : 'designData.flange.showAll')}</button>
        <button type="button" class="fb-del" disabled={!ticked.size} onclick={removeTicked} data-testid="dd-flange-remove">{tp('designData.flange.removeTicked', { n: ticked.size })}</button>
      </div>
      <ul class="fb-list">
        {#each listed as id (id)}
          <li data-testid="dd-flange-beam">
            <label><input type="checkbox" checked={ticked.has(id)} onchange={(e) => toggle(id, e.currentTarget.checked)} /> <strong>{nameOf(id)}</strong> <span class="fb-lv">{levelOf(id)}</span></label>
            <button type="button" class="fb-x" aria-label={tp('designData.flange.remove', { name: nameOf(id) })} onclick={() => setFlangeBeams(listed.filter((x) => x !== id))}>×</button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="fb-empty" data-testid="dd-flange-empty">{t('designData.flange.none')}</p>
    {/if}
  {/if}
</div>

<style>
  .fb { display: flex; flex-direction: column; gap: 6px; margin: 4px 0 6px 22px; font-size: 0.72rem; }
  .fb-seg { display: inline-grid; grid-auto-flow: column; gap: 2px; padding: 2px; border-radius: 4px; background: var(--st-surface-2); justify-self: start; width: max-content; }
  .fb-seg button { border: none; background: none; color: var(--st-text-2); padding: 3px 10px; border-radius: 3px; cursor: pointer; font-size: 0.7rem; }
  .fb-seg button.on { background: var(--st-surface-3); color: var(--st-accent); box-shadow: inset 0 0 0 1px var(--st-hair-strong); }
  .fb-add { display: flex; gap: 4px; }
  .fb-add input { flex: 1; min-width: 0; font-size: 0.72rem; padding: 2px 6px; border: 1px solid var(--st-hair); border-radius: 4px; background: var(--st-surface); color: var(--st-text); }
  .fb-sel { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 4px 6px; border: 1px dashed var(--st-accent); border-radius: 4px; }
  .fb-names { color: var(--st-text); font-weight: 600; }
  .fb-empty { margin: 0; color: var(--st-text-3); }
  .fb-warn { margin: 0; color: var(--st-warn, var(--st-text-2)); }
  .fb-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .fb-tools label { display: inline-flex; align-items: center; gap: 4px; color: var(--st-text-2); }
  .fb-list { list-style: none; margin: 0; padding: 0; max-height: 180px; overflow-y: auto; border: 1px solid var(--st-hair); border-radius: 4px; }
  .fb-list li { display: flex; align-items: center; justify-content: space-between; padding: 2px 6px; }
  .fb-list li:nth-child(odd) { background: var(--st-surface-2); }
  .fb-list label { display: inline-flex; align-items: center; gap: 6px; }
  .fb-lv { color: var(--st-text-3); }
  .fb-x { border: none; background: none; color: var(--st-text-3); cursor: pointer; font-size: 0.85rem; }
  .fb-x:hover, .fb-del:not(:disabled) { color: var(--st-danger); }
  button { font-size: 0.7rem; }
</style>
