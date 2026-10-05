<script lang="ts">
  /**
   * What the next support restrains, as Basic's 3D tool asks it: a ticked degree of freedom is
   * held. "Springs" turns the held ones elastic: each takes a stiffness, and one left empty stays
   * rigid. The same fields in the "Write support" card and in the drawing bar, on the one draft
   * both place (`drawState.support`, `model/support-3d.ts`).
   */
  import { t } from '../../lib/i18n';
  import { drawState } from '../../lib/store/draw-state.svelte';
  import { DOF_SPRING, type Dof3D } from '../../lib/model/support-3d';

  const draft = drawState.support;
  const LABEL: Record<Dof3D, string> = { tx: 'Fx', ty: 'Fy', tz: 'Fz', rx: 'Mx', ry: 'My', rz: 'Mz' };
  const TITLE: Record<Dof3D, string> = {
    tx: 'float.supportRestrainTx', ty: 'float.supportRestrainTy', tz: 'float.supportRestrainTz',
    rx: 'float.supportRestrainRx', ry: 'float.supportRestrainRy', rz: 'float.supportRestrainRz',
  };
  const unit = (d: Dof3D) => (d.startsWith('t') ? 'kN/m' : 'kN·m/rad');

  function preset(kind: 'fixed' | 'pinned') {
    for (const [d] of DOF_SPRING) draft.dofs[d] = kind === 'fixed' || d.startsWith('t');
  }
</script>

<span class="sd" data-testid="support-dofs">
  <span class="sd-group">
    <span class="sd-name">{t('support.restrains')}</span>
    {#each DOF_SPRING as [d] (d)}
      <label class="sd-chk" title={t(TITLE[d])}><input type="checkbox" bind:checked={draft.dofs[d]} data-testid="sup-dof-{d}" /> {LABEL[d]}</label>
    {/each}
  </span>
  <span class="sd-group">
    <button type="button" class="sd-btn" onclick={() => preset('fixed')} title={t('float.supportFixed3dTitle')} data-testid="sup-preset-fixed">{t('float.supportFixedShort')}</button>
    <button type="button" class="sd-btn" onclick={() => preset('pinned')} title={t('float.supportPinned3dTitle')} data-testid="sup-preset-pinned">{t('float.supportPinnedShort')}</button>
    <label class="sd-chk" title={t('support.elasticHint')}><input type="checkbox" bind:checked={draft.elastic} data-testid="sup-elastic" /> {t('support.elastic')}</label>
  </span>
  {#if draft.elastic}
    <span class="sd-group" data-testid="sup-springs">
      {#each DOF_SPRING.filter(([d]) => draft.dofs[d]) as [d, k] (k)}
        <label class="sd-k">{k} <span class="sd-unit">{unit(d)}</span>
          <input type="number" min="0" step="any" value={draft.springs[k] ?? ''} placeholder={t('support.rigid')}
            title={unit(d)} onchange={(e) => { const v = Number(e.currentTarget.value); draft.springs[k] = v > 0 ? v : undefined; }}
            data-testid="sup-k-{k}" />
        </label>
      {:else}
        <span class="sd-name">{t('support.noneRestrained')}</span>
      {/each}
    </span>
  {/if}
</span>

<style>
  .sd { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
  .sd-group { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
  .sd-name { color: var(--st-text-3); }
  .sd-chk, .sd-k { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; cursor: pointer; }
  .sd-k input { width: 72px; }
  .sd-btn {
    padding: 1px 7px; border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius);
    background: none; color: var(--st-text-2); font: inherit; cursor: pointer;
  }
  .sd-btn:hover { color: var(--st-text); border-color: var(--st-accent); }
  .sd-unit { color: var(--st-text-3); font-size: 0.6rem; }
</style>
