<script lang="ts">
  /**
   * A slab or raft on the ground: vertical springs k = ks · A at the nodes of the selected shells,
   * with ks from the project's soil profile or typed
   * (`engine/foundation-springs.ts`). Optionally one-way, so the raft can lift, and held
   * horizontally. One undo step; a node's existing support is replaced.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { foundationSprings, tributaryAreas } from '../../lib/engine/foundation-springs';

  const profiles = $derived(modelStore.geotechnical?.profiles ?? []);
  let source = $state<string>('typed');
  let ksTyped = $state(20000);
  let uplift = $state(true);
  let holdHorizontal = $state(true);
  let done = $state<string | null>(null);

  const ks = $derived.by(() => {
    if (source === 'typed') return ksTyped;
    const p = profiles.find((x) => String(x.id) === source);
    return p?.subgradeModulusKNm3 ?? null;
  });

  /** The selected shells. None selected: nothing, and the panel asks for them. */
  const shells = $derived.by(() => {
    const out: Array<{ nodes: number[] }> = [];
    for (const key of uiStore.selectedShells) {
      const id = Number(key.slice(1));
      const s = key[0] === 'q' ? modelStore.quads.get(id) : modelStore.plates.get(id);
      if (s) out.push({ nodes: [...s.nodes] });
    }
    return out;
  });
  const springs = $derived(ks && ks > 0 && shells.length ? foundationSprings(tributaryAreas(modelStore.nodes, shells), ks) : []);
  const totalArea = $derived(springs.reduce((s, x) => s + x.area, 0));

  function apply() {
    if (springs.length === 0) return;
    modelStore.batch(() => {
      for (const sp of springs) {
        modelStore.addSupportEntry({
          nodeId: sp.nodeId, type: 'custom3d',
          dofRestraints: { tx: holdHorizontal, ty: holdHorizontal, tz: false, rx: false, ry: false, rz: false },
          dofFrame: 'global', kz: sp.kz, ...(uplift ? { uplift: true } : {}),
        } as never);
      }
    });
    done = tp('foundation.applied', { n: springs.length, area: totalArea.toFixed(2) });
  }
</script>

<div class="fs" data-testid="foundation-springs">
  <!-- Its card in Specifications › Surfaces carries the title. -->
  <p class="fs-hint">{t('foundation.hint')}</p>
  <label class="fs-row">ks
    <select bind:value={source} data-testid="fs-source">
      <option value="typed">{t('foundation.typed')}</option>
      {#each profiles as p (p.id)}
        <option value={String(p.id)} disabled={p.subgradeModulusKNm3 === null}>{p.name}{p.subgradeModulusKNm3 === null ? ` (${t('foundation.noKs')})` : ` · ${p.subgradeModulusKNm3} kN/m³`}</option>
      {/each}
    </select>
    {#if source === 'typed'}<input type="number" min="1" step="1000" bind:value={ksTyped} data-testid="fs-ks" /> kN/m³{/if}
  </label>
  <label class="pk-check"><input type="checkbox" bind:checked={uplift} data-testid="fs-uplift" /> {t('foundation.oneWay')}</label>
  <label class="pk-check"><input type="checkbox" bind:checked={holdHorizontal} /> {t('foundation.holdHorizontal')}</label>
  <p class="fs-hint" data-testid="fs-summary">
    {shells.length === 0 ? t('foundation.selectShells') : tp('foundation.summary', { n: springs.length, area: totalArea.toFixed(2), shells: shells.length })}
  </p>
  <button class="pk-btn pk-btn-primary fs-go" disabled={springs.length === 0} onclick={apply} data-testid="fs-apply">{t('foundation.apply')}</button>
  {#if done}<p class="fs-hint" data-testid="fs-done">{done}</p>{/if}
</div>

<style>
  .fs { display: flex; flex-direction: column; gap: 0.45rem; color: var(--st-text-2); }
  .fs-go { align-self: flex-start; }
  .fs-row { display: flex; gap: 6px; align-items: center; }
  .fs-row input[type='number'] { width: 80px; }
  .fs-hint { margin: 0; font-size: 0.64rem; color: var(--st-text-3); line-height: 1.4; }
</style>
