<script lang="ts">
  /**
   * A footing's geometry and its ground, edited in place: kind and piles, plan, thickness, cover,
   * founding level, rotation, eccentricity, the column it carries, its stratum and its pedestal,
   * with the issues `validateFooting` raises. Shared by the Foundations panel and the design desk.
   */
  import { t, tp } from '../../../lib/i18n';
  import { identifyMessages } from '../../../lib/codes/message';
  import { modelStore } from '../../../lib/store/model.svelte';
  import { validateFooting, type Footing } from '../../../lib/model/footing';
  import QuantityInput from '../loads/QuantityInput.svelte';

  let { footing: f }: { footing: Footing } = $props();
  const profiles = $derived(modelStore.model.geotechnical?.profiles ?? []);

  /** Columns landing on a footing's node, so the reference is chosen from what exists. */
  function columnsAt(nodeId: number): number[] {
    return [...modelStore.model.elements.values()]
      .filter((e) => e.nodeI === nodeId || e.nodeJ === nodeId)
      .map((e) => e.id)
      .sort((a, b) => a - b);
  }

  /** Numeric field write-through. Blank clears to 0 rather than to NaN. */
  function num(v: string): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
</script>

<div class="grid">
  <label>{t('footing.ui.name')}
    <input type="text" value={f.name} data-testid="footing-name"
           oninput={(e) => modelStore.updateFooting(f.id, { name: e.currentTarget.value })} />
  </label>
  <label>{t('fdn.kind')}
    <select value={f.kind} data-testid="footing-kind"
            onchange={(e) => modelStore.updateFooting(f.id, { kind: e.currentTarget.value as typeof f.kind })}>
      {#each ['isolated', 'combined', 'strip', 'pileCap'] as k}<option value={k}>{t(`fdn.kind.${k}`)}</option>{/each}
      {#if f.kind === 'mat'}<option value="mat">{t('fdn.kind.mat')}</option>{/if}
    </select>
  </label>
  {#if f.kind === 'pileCap'}
    <label>{t('fdn.pilesCount')}
      <input type="number" min="1" step="1" value={f.piles?.count ?? 2} data-testid="footing-piles"
             onchange={(e) => modelStore.updateFooting(f.id, { piles: { diameter: 0.5, length: 12, spacing: 1.5, ...f.piles, count: Math.max(1, Math.round(num(e.currentTarget.value))) } })} />
    </label>
    <label>{t('fdn.pileDiameter')}
      <input type="number" min="0.2" step="0.05" value={f.piles?.diameter ?? 0.5}
             onchange={(e) => modelStore.updateFooting(f.id, { piles: { count: 2, length: 12, spacing: 1.5, ...f.piles, diameter: num(e.currentTarget.value) } })} />
    </label>
    <label>{t('fdn.pileLength')}
      <input type="number" min="1" step="0.5" value={f.piles?.length ?? 12}
             onchange={(e) => modelStore.updateFooting(f.id, { piles: { count: 2, diameter: 0.5, spacing: 1.5, ...f.piles, length: num(e.currentTarget.value) } })} />
    </label>
  {/if}
  <label>{t('footing.ui.field.B')}
    <QuantityInput quantity="length" min={0} value={f.B} testid="footing-B"
           onchange={(v) => modelStore.updateFooting(f.id, { B: v })} />
  </label>
  <label>{t('footing.ui.field.L')}
    <QuantityInput quantity="length" min={0} value={f.L} testid="footing-L"
           onchange={(v) => modelStore.updateFooting(f.id, { L: v })} />
  </label>
  <label>{t('footing.ui.field.thickness')}
    <QuantityInput quantity="length" min={0} value={f.thickness} testid="footing-thickness"
           onchange={(v) => modelStore.updateFooting(f.id, { thickness: v })} />
  </label>
  <label>{t('footing.ui.field.cover')}
    <QuantityInput quantity="length" min={0} value={f.cover} testid="footing-cover"
           onchange={(v) => modelStore.updateFooting(f.id, { cover: v })} />
  </label>
  <label>{t('footing.ui.field.foundingElevation')}
    <QuantityInput quantity="length" value={f.foundingElevation} testid="footing-elevation"
           onchange={(v) => modelStore.updateFooting(f.id, { foundingElevation: v })} />
  </label>
  <label>{t('footing.ui.rotation')}
    <input type="number" step="5" value={f.rotationDeg} data-testid="footing-rotation"
           oninput={(e) => modelStore.updateFooting(f.id, { rotationDeg: num(e.currentTarget.value) })} />
  </label>
  <label>{t('footing.ui.field.eccentricityB')}
    <QuantityInput quantity="length" value={f.eccentricityB} testid="footing-ecc-b"
           onchange={(v) => modelStore.updateFooting(f.id, { eccentricityB: v })} />
  </label>
  <label>{t('footing.ui.field.eccentricityL')}
    <QuantityInput quantity="length" value={f.eccentricityL} testid="footing-ecc-l"
           onchange={(v) => modelStore.updateFooting(f.id, { eccentricityL: v })} />
  </label>
  <label>{t('footing.ui.column')}
    <select data-testid="footing-column"
            onchange={(e) => {
              const v = e.currentTarget.value;
              modelStore.updateFooting(f.id, {
                columnElementId: v === '' ? undefined : Number(v),
              });
            }}>
      <option value="" selected={f.columnElementId === undefined}>
        {t('footing.ui.noColumn')}
      </option>
      {#each columnsAt(f.nodeId) as e (e)}
        <option value={e} selected={f.columnElementId === e}>
          {tp('footing.ui.elementOption', { element: e })}
        </option>
      {/each}
    </select>
  </label>
  <label>{t('footing.ui.soilProfile')}
    <select data-testid="footing-soil"
            onchange={(e) => {
              const v = e.currentTarget.value;
              modelStore.updateFooting(f.id, {
                soilProfileId: v === '' ? null : Number(v),
              });
            }}>
      <option value="" selected={f.soilProfileId === null}>
        {t('footing.ui.noSoilProfile')}
      </option>
      {#each profiles as p (p.id)}
        <option value={p.id} selected={f.soilProfileId === p.id}>{p.name}</option>
      {/each}
    </select>
  </label>
</div>

<!--
  The pedestal is optional, so it is opt-in rather than a set of zeroed fields that
  would fail validation for a footing that simply does not have one.
-->
<label class="check">
  <input type="checkbox" checked={f.pedestal !== undefined} data-testid="footing-pedestal-on"
         onchange={(e) => modelStore.updateFooting(f.id, {
           pedestal: e.currentTarget.checked
             ? { B: f.B > 0 ? Math.min(0.5, f.B) : 0.5, L: f.L > 0 ? Math.min(0.5, f.L) : 0.5, height: 0.5 }
             : undefined,
         })} />
  {t('footing.ui.hasPedestal')}
</label>
{#if f.pedestal}
  {@const p = f.pedestal}
  <div class="grid">
    <label>{t('footing.ui.field.pedestalB')}
      <QuantityInput quantity="length" min={0} value={p.B} testid="footing-pedestal-b"
             onchange={(v) => modelStore.updateFooting(f.id, { pedestal: { ...p, B: v } })} />
    </label>
    <label>{t('footing.ui.field.pedestalL')}
      <QuantityInput quantity="length" min={0} value={p.L} testid="footing-pedestal-l"
             onchange={(v) => modelStore.updateFooting(f.id, { pedestal: { ...p, L: v } })} />
    </label>
    <label>{t('footing.ui.field.pedestalHeight')}
      <QuantityInput quantity="length" min={0} value={p.height} testid="footing-pedestal-h"
             onchange={(v) => modelStore.updateFooting(f.id, { pedestal: { ...p, height: v } })} />
    </label>
  </div>
{/if}

{#each [validateFooting(f)] as issues (f.id)}
  {#if issues.length > 0}
    <ul class="issues" data-testid="footing-issues">
      {#each identifyMessages(issues.map((i) => i.message)) as m, ix (m.id)}
        <li class={issues[ix].severity}>
          {tp(m.message.key, (m.message.params ?? {}) as Record<string, string | number>)}
        </li>
      {/each}
    </ul>
  {/if}
{/each}

<style>
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 0.45rem; }
  label { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.75rem; }
  label.check { flex-direction: row; align-items: center; gap: 0.35rem; margin-top: 0.5rem; }
  input, select { font: inherit; padding: 0.2rem 0.3rem; }
  ul { list-style: none; margin: 0.4rem 0; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
  .issues { margin-top: 0.5rem; gap: 0.15rem; }
  .issues li { font-size: 0.74rem; padding: 0.15rem 0.4rem; border-radius: 3px; }
  /* Blocking is never green; advisory is never red. */
  .issues li.blocking { background: var(--st-surface-2); color: var(--st-danger); }
  .issues li.advisory { background: var(--st-surface-3); color: var(--st-warn); }
</style>
