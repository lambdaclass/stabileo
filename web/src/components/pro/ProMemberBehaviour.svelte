<script lang="ts">
  /**
   * The selected members' stiffness factors for the analysis (CIRSOC 201-2025 Tabla
   * 6.6.3.1.1(a) presets, or typed), their global end joints and their semi-rigid ends. Part of
   * Specifications › Members, which edits their axial behaviour and local releases beside it.
   * Stored on each member and honoured by every solve (`engine/member-behaviour.ts`). One undo
   * step per change, over the whole selection.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { JOINT3D_DOF_LABELS } from '../../lib/store/model.svelte';
  import { CIRSOC201_STIFFNESS, presetModifiers, type StiffnessPreset, type StiffnessModifiers } from '../../lib/engine/member-behaviour';

  const ids = $derived([...uiStore.selectedElements].filter((id) => modelStore.elements.has(id)));
  const first = $derived(ids.length ? modelStore.elements.get(ids[0]!) : undefined);
  const same = <T,>(f: (id: number) => T) => { const v = ids.map(f); return v.every((x) => JSON.stringify(x) === JSON.stringify(v[0])) ? v[0] : undefined; };
  const presetNow = $derived(same((id) => modelStore.elements.get(id)?.stiffness?.preset ?? (modelStore.elements.get(id)?.stiffness ? 'custom' : 'none')) ?? 'mixed');
  const PRESETS = Object.keys(CIRSOC201_STIFFNESS) as StiffnessPreset[];

  let custom = $state({ a: 1, iy: 1, iz: 1, j: 1 });
  $effect(() => {
    const s = first?.stiffness;
    if (s && !s.preset) custom = { a: s.a ?? 1, iy: s.iy ?? 1, iz: s.iz ?? 1, j: s.j ?? 1 };
  });

  function setStiffness(m: StiffnessModifiers | undefined) {
    modelStore.batch(() => { for (const id of ids) modelStore.updateElement(id, { stiffness: m }); });
  }
  function setPreset(v: string) {
    if (v === 'none') setStiffness(undefined);
    else if (v === 'custom') setStiffness({ ...custom });
    else setStiffness(presetModifiers(v as StiffnessPreset));
  }
  // ── End releases, all six relative degrees of freedom (the joint masks Basic 3D sets too) ──
  const jointOf = (end: 'i' | 'j') => same((id) => {
    const e = modelStore.elements.get(id);
    return [...((end === 'i' ? e?.jointI : e?.jointJ)?.dof ?? [false, false, false, false, false, false])];
  });
  function toggleJoint(end: 'i' | 'j', k: number, on: boolean) {
    modelStore.batch(() => {
      for (const id of ids) {
        const e = modelStore.elements.get(id);
        const cur = [...((end === 'i' ? e?.jointI : e?.jointJ)?.dof ?? [false, false, false, false, false, false])];
        cur[k] = on;
        modelStore.setElementJoint(id, end, cur.some(Boolean) ? cur : null);
      }
    });
  }

  // ── Semi-rigid ends ──
  const semiOf = (end: 'i' | 'j') => same((id) => modelStore.elements.get(id)?.semiRigid?.[end] ?? null);
  function setSemi(end: 'i' | 'j', which: 'ky' | 'kz' | 'off', v?: number) {
    // `min` does not stop a typed value: a negative or empty one is not stored.
    if (which !== 'off' && !(Number.isFinite(v) && v! >= 0)) return;
    modelStore.batch(() => {
      for (const id of ids) {
        const e = modelStore.elements.get(id);
        const cur = { ...(e?.semiRigid ?? {}) };
        if (which === 'off') delete cur[end];
        else cur[end] = { ky: cur[end]?.ky ?? 1e4, kz: cur[end]?.kz ?? 1e4, [which]: v! };
        modelStore.updateElement(id, { semiRigid: cur.i || cur.j ? cur : undefined });
      }
    });
  }

  function setCustom(k: keyof typeof custom, v: number) {
    if (!(v > 0)) return;
    custom = { ...custom, [k]: v };
    setStiffness({ ...custom });
  }
</script>

{#if ids.length > 0}
  <div class="mb" data-testid="member-behaviour">
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
    <div class="mb-joints">
      <span>{t('behaviour.releases')}</span>
      {#each ['i', 'j'] as const as end (end)}
        {@const mask = jointOf(end)}
        <div class="mb-row" data-testid="mb-joint-{end}">
          <span class="mb-end">{end.toUpperCase()}</span>
          {#each JOINT3D_DOF_LABELS as lbl, k (lbl)}
            <label class="mb-dof"><input type="checkbox" checked={!!mask?.[k]} indeterminate={mask === undefined}
              onchange={(e) => toggleJoint(end, k, e.currentTarget.checked)} data-testid="mb-joint-{end}-{k}" /> {lbl}</label>
          {/each}
        </div>
      {/each}
      <p class="mb-hint">{t('behaviour.releasesHint')}</p>
    </div>
    <div class="mb-joints">
      <span>{t('behaviour.semiRigid')}</span>
      {#each ['i', 'j'] as const as end (end)}
        {@const sr = semiOf(end)}
        <div class="mb-row" data-testid="mb-semi-{end}">
          <span class="mb-end">{end.toUpperCase()}</span>
          <label class="mb-dof"><input type="checkbox" checked={!!sr} onchange={(e) => (e.currentTarget.checked ? setSemi(end, 'ky', sr?.ky ?? 1e4) : setSemi(end, 'off'))} data-testid="mb-semi-{end}-on" /></label>
          {#if sr}
            <label>kθy <input type="number" min="0" step="1000" value={sr.ky} onchange={(e) => setSemi(end, 'ky', Number(e.currentTarget.value))} data-testid="mb-semi-{end}-ky" /></label>
            <label>kθz <input type="number" min="0" step="1000" value={sr.kz} onchange={(e) => setSemi(end, 'kz', Number(e.currentTarget.value))} /></label>
            <span>kN·m/rad</span>
          {/if}
        </div>
      {/each}
      <p class="mb-hint">{t('behaviour.semiRigidHint')}</p>
    </div>
  </div>
{/if}

<style>
  .mb { display: flex; flex-direction: column; gap: 4px; padding: 6px 10px; border-bottom: 1px solid var(--st-hair); font-size: 0.68rem; color: var(--st-text-2); }
  .mb-title { font-weight: 600; color: var(--st-text); font-size: 0.7rem; }
  .mb-row { display: flex; gap: 8px; align-items: center; }
  .mb-wrap { flex-wrap: wrap; }
  .mb-row input { width: 56px; }
  .mb-joints { display: flex; flex-direction: column; gap: 2px; }
  .mb-end { font-weight: 600; width: 12px; }
  .mb-dof { display: flex; gap: 2px; align-items: center; font-family: var(--st-mono); font-size: 0.62rem; }
  .mb-hint { margin: 0; font-size: 0.62rem; color: var(--st-text-3); }
</style>
