<script lang="ts">
  /**
   * What the selected members do beyond the linear: inactive, tension only, compression only, and
   * stiffness factors for the analysis (CIRSOC 201-2025 Tabla 6.6.3.1.1(a) presets, or typed).
   * Stored on each member and honoured by every solve (`engine/member-behaviour.ts`). One undo
   * step per change, over the whole selection.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { CIRSOC201_STIFFNESS, presetModifiers, type MemberBehaviour, type StiffnessPreset, type StiffnessModifiers } from '../../lib/engine/member-behaviour';

  const ids = $derived([...uiStore.selectedElements].filter((id) => modelStore.elements.has(id)));
  const first = $derived(ids.length ? modelStore.elements.get(ids[0]!) : undefined);
  const same = <T,>(f: (id: number) => T) => { const v = ids.map(f); return v.every((x) => JSON.stringify(x) === JSON.stringify(v[0])) ? v[0] : undefined; };
  const behaviour = $derived(same((id) => modelStore.elements.get(id)?.behaviour ?? 'linear') ?? 'mixed');
  const presetNow = $derived(same((id) => modelStore.elements.get(id)?.stiffness?.preset ?? (modelStore.elements.get(id)?.stiffness ? 'custom' : 'none')) ?? 'mixed');
  const PRESETS = Object.keys(CIRSOC201_STIFFNESS) as StiffnessPreset[];

  let custom = $state({ a: 1, iy: 1, iz: 1, j: 1 });
  $effect(() => {
    const s = first?.stiffness;
    if (s && !s.preset) custom = { a: s.a ?? 1, iy: s.iy ?? 1, iz: s.iz ?? 1, j: s.j ?? 1 };
  });

  function setBehaviour(v: string) {
    modelStore.batch(() => {
      for (const id of ids) modelStore.updateElement(id, { behaviour: v === 'linear' ? undefined : (v as MemberBehaviour) });
    });
  }
  function setStiffness(m: StiffnessModifiers | undefined) {
    modelStore.batch(() => { for (const id of ids) modelStore.updateElement(id, { stiffness: m }); });
  }
  function setPreset(v: string) {
    if (v === 'none') setStiffness(undefined);
    else if (v === 'custom') setStiffness({ ...custom });
    else setStiffness(presetModifiers(v as StiffnessPreset));
  }
  function setCustom(k: keyof typeof custom, v: number) {
    if (!(v > 0)) return;
    custom = { ...custom, [k]: v };
    setStiffness({ ...custom });
  }
</script>

{#if ids.length > 0}
  <div class="mb" data-testid="member-behaviour">
    <div class="mb-title">{tp('behaviour.title', { n: ids.length })}</div>
    <label class="mb-row">{t('behaviour.label')}
      <select value={behaviour} onchange={(e) => setBehaviour(e.currentTarget.value)} data-testid="mb-behaviour">
        {#if behaviour === 'mixed'}<option value="mixed" disabled>{t('behaviour.mixed')}</option>{/if}
        <option value="linear">{t('behaviour.linear')}</option>
        <option value="tensionOnly">{t('behaviour.tensionOnly')}</option>
        <option value="compressionOnly">{t('behaviour.compressionOnly')}</option>
        <option value="inactive">{t('behaviour.inactive')}</option>
      </select>
    </label>
    {#if behaviour === 'tensionOnly' || behaviour === 'compressionOnly'}
      <p class="mb-hint">{t('behaviour.nonlinearHint')}</p>
    {/if}
    <label class="mb-row">{t('behaviour.stiffness')}
      <select value={presetNow} onchange={(e) => setPreset(e.currentTarget.value)} data-testid="mb-stiffness">
        {#if presetNow === 'mixed'}<option value="mixed" disabled>{t('behaviour.mixed')}</option>{/if}
        <option value="none">{t('behaviour.stiffness.none')}</option>
        {#each PRESETS as p (p)}<option value={p}>{tp(`behaviour.preset.${p}`, { f: String(CIRSOC201_STIFFNESS[p]).replace('.', ',') })}</option>{/each}
        <option value="custom">{t('behaviour.stiffness.custom')}</option>
      </select>
    </label>
    {#if presetNow === 'custom'}
      <div class="mb-row mb-wrap">
        {#each ['a', 'iy', 'iz', 'j'] as const as k (k)}
          <label>{k === 'a' ? 'A' : k === 'j' ? 'J' : k === 'iy' ? 'Iy' : 'Iz'} ×
            <input type="number" min="0.01" step="0.05" value={custom[k]} onchange={(e) => setCustom(k, Number(e.currentTarget.value))} data-testid="mb-f-{k}" /></label>
        {/each}
      </div>
    {/if}
    {#if presetNow !== 'none' && presetNow !== 'mixed'}<p class="mb-hint">{t('behaviour.stiffnessHint')}</p>{/if}
  </div>
{/if}

<style>
  .mb { display: flex; flex-direction: column; gap: 4px; padding: 6px 10px; border-bottom: 1px solid var(--st-hair); font-size: 0.68rem; color: var(--st-text-2); }
  .mb-title { font-weight: 600; color: var(--st-text); font-size: 0.7rem; }
  .mb-row { display: flex; gap: 8px; align-items: center; }
  .mb-wrap { flex-wrap: wrap; }
  .mb-row input { width: 56px; }
  .mb-hint { margin: 0; font-size: 0.62rem; color: var(--st-text-3); }
</style>
