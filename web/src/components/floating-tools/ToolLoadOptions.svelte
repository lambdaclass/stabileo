<script lang="ts" module>
  import { axisName, twoD } from '../../lib/axes/display';
  import { TWO_D_NODAL_LOAD_LABELS } from '../../lib/geometry/coordinate-system';
  import type { Quantity } from '../../lib/utils/units';
  /** What `uiStore.loadValue` was last shown as; kept while the toolbar is closed. */
  let loadValueShownAs: Quantity | null = null;
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import ToolGlyph from './ToolGlyph.svelte';
  import { uiStore, modelStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import UnitInput from '../UnitInput.svelte';
  import { unitQ } from '../../lib/store/display-units.svelte';
  import { keepTypedNumber } from '../../lib/utils/unit-input';
  const qAxis = (k: 1 | 2) => (uiStore.distLoadFrame3D === 'global' ? axisName(k) : k === 1 ? 'Y' : 'Z');

  /*
   * Values are typed in the unit system chosen under Settings and kept in SI
   * (UnitInput). What the one value of a point load is depends on its direction.
   */
  const nodalQty3D = $derived<Quantity>(['mx', 'my', 'mz'].includes(uiStore.nodalLoadDir3D) ? 'moment' : 'force');
  const nodalQty2D = $derived<Quantity>(uiStore.nodalLoadDir === 'my' ? 'moment' : 'force');

  /*
   * One value serves the point force, the moment and the 2D distributed load.
   * Switching between them keeps the number on screen (2 kip becomes 2 kip/ft,
   * not the 0.61 kip/ft the same SI value is): `keepTypedNumber`.
   */
  const loadValueQty = $derived<Quantity | null>(
    uiStore.loadType === 'nodal' ? (uiStore.is3DWorkspace ? nodalQty3D : nodalQty2D)
    : uiStore.loadType === 'distributed' && !uiStore.is3DWorkspace ? 'distributedLoad'
    : null,
  );
  $effect(() => {
    const q = loadValueQty;
    if (!q) return;
    untrack(() => {
      if (loadValueShownAs && loadValueShownAs !== q) uiStore.loadValue = keepTypedNumber(uiStore.loadValue, loadValueShownAs, q, uiStore.unitSystem);
      loadValueShownAs = q;
    });
  });

  const loadTypes = [
    { id: 'nodal', key: 'float.loadPoint' },
    { id: 'distributed', key: 'float.loadDistributed' },
    { id: 'thermal', key: 'float.loadThermal' },
  ] as const;
  const LOAD_GLYPH = { nodal: 'loadPoint', distributed: 'loadDistributed', thermal: 'loadThermal' } as const;
</script>

<!--
  Where on the member a distributed load goes: all of it, or a stretch from and to, in m from the
  member's node I. PRO places its member loads from its own draw bar.
-->
{#snippet stretch()}
  {#if uiStore.appMode !== 'pro'}
    <span class="ft-row" aria-hidden="true"></span>
    <span class="ft-sep">|</span>
    <button class="ft-opt-btn ft-coord-btn ft-span" class:active={!uiStore.distLoadPartial} onclick={() => (uiStore.distLoadPartial = false)}
      title={t('float.distWholeTip')} data-testid="dist-span-whole">{t('float.distWhole')}</button>
    <button class="ft-opt-btn ft-coord-btn ft-span" class:active={uiStore.distLoadPartial} onclick={() => (uiStore.distLoadPartial = true)}
      title={t('float.distStretchTip')} data-testid="dist-span-stretch">{t('float.distStretch')}</button>
    {#if uiStore.distLoadPartial}
      <span class="ft-span-range">
      <label class="ft-input-group" title={t('float.distStretchTip')}>
        <span>{t('float.distFrom')}</span>
        <UnitInput value={uiStore.distLoadFrom ?? NaN} qty={'length'} onchange={(v) => (uiStore.distLoadFrom = v)} onempty={() => (uiStore.distLoadFrom = null)}
          placeholder="0" unit={false} live testid="dist-span-from" />
      </label>
      <label class="ft-input-group" title={t('float.distStretchTip')}>
        <span>{t('float.distTo')}</span>
        <UnitInput value={uiStore.distLoadTo ?? NaN} qty={'length'} onchange={(v) => (uiStore.distLoadTo = v)} onempty={() => (uiStore.distLoadTo = null)}
          placeholder="L" unit={false} live testid="dist-span-to" />
        <span class="ft-unit">{unitQ('length')}</span>
      </label>
      </span>
    {/if}
  {/if}
{/snippet}

<!-- Basic switches self-weight in its loads panel; PRO has no other switch. -->
{#if uiStore.appMode !== 'basico'}
  <label class="ft-selfweight-toggle" title={t('float.loadSelfWeightTooltip')}>
    <input type="checkbox" bind:checked={uiStore.includeSelfWeight} />
    <span>{t('float.selfWeightLabel')}</span>
  </label>
  <span class="ft-sep">|</span>
{/if}
<!-- The load case: in Basic only when asked for under Settings (every load goes to the first case). -->
{#if uiStore.showLoadCasePicker}
<span class="ft-case-dot" style="background: {modelStore.getLoadCaseColor(uiStore.activeLoadCaseId)}"></span>
<select class="ft-case-select"
  value={String(uiStore.activeLoadCaseId)}
  onchange={(e) => uiStore.activeLoadCaseId = parseInt(e.currentTarget.value)}
  title={t('float.activeLoadCase')} data-testid="load-case-select">
  {#each modelStore.loadCases as lc}
    <option value={String(lc.id)}>{lc.type || lc.name}</option>
  {/each}
</select>
<span class="ft-sep">|</span>
{/if}
{#each loadTypes as lt}
  <button
    class="ft-opt-btn ft-primary"
    class:active={uiStore.loadType === lt.id}
    onclick={() => uiStore.loadType = lt.id}
  ><ToolGlyph name={LOAD_GLYPH[lt.id]} />{t(lt.key)}</button>
{/each}
<span class="ft-break" aria-hidden="true"></span>
<span class="ft-sep">|</span>
{#if uiStore.loadType === 'nodal'}
  {#if uiStore.is3DWorkspace}
    <!-- 3D: 6 DOF directions -->
    <button class="ft-opt-btn ft-dir-btn" class:active={uiStore.nodalLoadDir3D === 'fx'}
      onclick={() => uiStore.nodalLoadDir3D = 'fx'} title={t('float.loadForceX3d')}>Fx</button>
    <button class="ft-opt-btn ft-dir-btn" class:active={uiStore.nodalLoadDir3D === 'fy'}
      onclick={() => uiStore.nodalLoadDir3D = 'fy'} title={t('float.loadForceY3d')}>Fy</button>
    <button class="ft-opt-btn ft-dir-btn" class:active={uiStore.nodalLoadDir3D === 'fz'}
      onclick={() => uiStore.nodalLoadDir3D = 'fz'} title={t('float.loadForceZ3d')}>Fz</button>
    <button class="ft-opt-btn ft-dir-btn" class:active={uiStore.nodalLoadDir3D === 'mx'}
      onclick={() => uiStore.nodalLoadDir3D = 'mx'} title={t('float.loadMomentX3d')}>Mx</button>
    <button class="ft-opt-btn ft-dir-btn" class:active={uiStore.nodalLoadDir3D === 'my'}
      onclick={() => uiStore.nodalLoadDir3D = 'my'} title={t('float.loadMomentY3d')}>My</button>
    <button class="ft-opt-btn ft-dir-btn" class:active={uiStore.nodalLoadDir3D === 'mz'}
      onclick={() => uiStore.nodalLoadDir3D = 'mz'} title={t('float.loadMomentZ3d')}>Mz</button>
    <label class="ft-input-group">
      <span>{['mx','my','mz'].includes(uiStore.nodalLoadDir3D) ? 'M:' : 'F:'}</span>
      <UnitInput value={uiStore.loadValue} qty={nodalQty3D} onchange={(v) => (uiStore.loadValue = v)} unit={false} live />
      <span class="ft-unit">{unitQ(nodalQty3D)}</span>
    </label>
  {:else}
  <!-- 2D: 3 directions -->
  <button class="ft-opt-btn ft-dir-btn" class:active={uiStore.nodalLoadDir === 'fx'}
    onclick={() => uiStore.nodalLoadDir = 'fx'}
    title={uiStore.loadIsGlobal ? t('float.loadForceXGlobal') : t('float.loadForceXLocal')}
  >{uiStore.loadIsGlobal ? TWO_D_NODAL_LOAD_LABELS.horizontal : 'Fi'}</button>
  <button class="ft-opt-btn ft-dir-btn" class:active={uiStore.nodalLoadDir === 'fz'}
    onclick={() => uiStore.nodalLoadDir = 'fz'}
    title={uiStore.loadIsGlobal ? t('float.loadForceYGlobal') : t('float.loadForceYLocal')}
  >{uiStore.loadIsGlobal ? TWO_D_NODAL_LOAD_LABELS.vertical : 'Fj'}</button>
  <button class="ft-opt-btn ft-dir-btn" class:active={uiStore.nodalLoadDir === 'my'}
    onclick={() => uiStore.nodalLoadDir = 'my'}
    title={t('float.loadMomentZ')}
  >{TWO_D_NODAL_LOAD_LABELS.moment}</button>
  <label class="ft-input-group">
    <span>{uiStore.nodalLoadDir === 'my' ? 'M:' : 'F:'}</span>
    <UnitInput value={uiStore.loadValue} qty={nodalQty2D} onchange={(v) => (uiStore.loadValue = v)} unit={false} live />
    <span class="ft-unit">{unitQ(nodalQty2D)}</span>
  </label>
  {#if uiStore.nodalLoadDir !== 'my'}
    <!--
      Which axes the force is in, for a load placed on a member. The pair names
      the chosen force: Fx is global X (horizontal) or along the member, Fz is
      global Z (vertical) or perpendicular to it. A couple is the same in any
      axes, so My has no pair.
    -->
    {@const alongX = uiStore.nodalLoadDir === 'fx'}
    <span class="ft-sep">|</span>
    <button class="ft-opt-btn ft-coord-btn" class:active={uiStore.loadIsGlobal} onclick={() => uiStore.loadIsGlobal = true}
      title={alongX ? t('float.loadGlobalXDir') : t('float.loadGlobalYDir')} data-testid="load-axes-global">{alongX ? twoD.horizontal : twoD.vertical}</button>
    <button class="ft-opt-btn ft-coord-btn" class:active={!uiStore.loadIsGlobal} onclick={() => uiStore.loadIsGlobal = false}
      title={alongX ? t('float.loadAxialDir') : t('float.loadPerpDir')} data-testid="load-axes-member">{alongX ? '∥' : '⊥'}</button>
    <label class="ft-input-group">
      <span>α:</span>
      <input type="number" bind:value={uiStore.loadAngle} step="5" />
      <span class="ft-unit">°</span>
    </label>
  {/if}
  {/if}
{:else if uiStore.loadType === 'thermal'}
  <label class="ft-input-group" title={t('float.thermalUniformTip')}>
    <span>ΔTg:</span>
    <UnitInput value={uiStore.thermalDT} qty={'temperatureDelta'} onchange={(v) => (uiStore.thermalDT = v)} unit={false} live />
    <span class="ft-unit">{unitQ('temperatureDelta')}</span>
  </label>
  <label class="ft-input-group" title={t('float.thermalGradientTip')}>
    <span>∇T:</span>
    <UnitInput value={uiStore.thermalDTg} qty={'temperatureDelta'} onchange={(v) => (uiStore.thermalDTg = v)} unit={false} live />
    <span class="ft-unit">{unitQ('temperatureDelta')}</span>
  </label>
{:else if uiStore.loadType === 'distributed'}
  {#if uiStore.is3DWorkspace}
    <label class="ft-input-group">
      <span>q{qAxis(1)}I:</span>
      <UnitInput value={uiStore.loadValueY3D} qty={'distributedLoad'} onchange={(v) => (uiStore.loadValueY3D = v)} unit={false} live />
      <span class="ft-unit">{unitQ('distributedLoad')}</span>
    </label>
    <label class="ft-input-group">
      <span>q{qAxis(1)}J:</span>
      <UnitInput value={uiStore.loadValueYJ3D} qty={'distributedLoad'} onchange={(v) => (uiStore.loadValueYJ3D = v)} unit={false} live />
      <span class="ft-unit">{unitQ('distributedLoad')}</span>
    </label>
  {:else}
    <label class="ft-input-group">
      <span>qI:</span>
      <UnitInput value={uiStore.loadValue} qty={'distributedLoad'} onchange={(v) => (uiStore.loadValue = v)} unit={false} live />
      <span class="ft-unit">{unitQ('distributedLoad')}</span>
    </label>
    <label class="ft-input-group">
      <span>qJ:</span>
      <UnitInput value={uiStore.loadValueJ} qty={'distributedLoad'} onchange={(v) => (uiStore.loadValueJ = v)} unit={false} live />
      <span class="ft-unit">{unitQ('distributedLoad')}</span>
    </label>
  {/if}
  {#if uiStore.is3DWorkspace}
    <label class="ft-input-group">
      <span>q{qAxis(2)}I:</span>
      <UnitInput value={uiStore.loadValueZ} qty={'distributedLoad'} onchange={(v) => (uiStore.loadValueZ = v)} unit={false} live />
      <span class="ft-unit">{unitQ('distributedLoad')}</span>
    </label>
    <label class="ft-input-group">
      <span>q{qAxis(2)}J:</span>
      <UnitInput value={uiStore.loadValueZJ} qty={'distributedLoad'} onchange={(v) => (uiStore.loadValueZJ = v)} unit={false} live />
      <span class="ft-unit">{unitQ('distributedLoad')}</span>
    </label>
    <!-- Which axes qY and qZ are along: the global ones (Z is the vertical) or the member's own. -->
    <span class="ft-sep">|</span>
    <button class="ft-opt-btn ft-coord-btn" class:active={uiStore.distLoadFrame3D === 'global'} onclick={() => (uiStore.distLoadFrame3D = 'global')}
      title={t('float.distFrameGlobal3D')} data-testid="dist-frame-global">{t('float.frameGlobal')}</button>
    <button class="ft-opt-btn ft-coord-btn" class:active={uiStore.distLoadFrame3D === 'local'} onclick={() => (uiStore.distLoadFrame3D = 'local')}
      title={t('float.distFrameLocal3D')} data-testid="dist-frame-local">{t('float.frameLocal')}</button>
    {@render stretch()}
  {:else}
  <span class="ft-sep">|</span>
  <button class="ft-opt-btn ft-coord-btn" class:active={uiStore.loadIsGlobal} onclick={() => uiStore.loadIsGlobal = true} title={t('float.loadGlobalYDir')}>{twoD.vertical}</button>
  <button class="ft-opt-btn ft-coord-btn" class:active={!uiStore.loadIsGlobal} onclick={() => uiStore.loadIsGlobal = false} title={t('float.loadPerpDir')}>⊥</button>
  <label class="ft-input-group">
    <span>α:</span>
    <input type="number" bind:value={uiStore.loadAngle} step="5" />
    <span class="ft-unit">°</span>
  </label>
  {@render stretch()}
  {/if}
{/if}

<style>
  /* Row breaks for the phone's layout (DataTable); nothing on a desktop. */
  .ft-break, .ft-row { display: none; }
  .ft-span { font-weight: 500; letter-spacing: 0; }
  /* "from … to … m" stays one piece when the bar wraps (the phone's sheet). */
  .ft-span-range { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }

  .ft-opt-btn {
    padding: 2px 8px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    color: var(--st-text-2);
    cursor: pointer;
    font-size: 0.7rem;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .ft-opt-btn:hover:not(:disabled) {
    background: var(--st-surface-3);
    color: var(--st-text);
  }

  .ft-opt-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    color: var(--st-text-3);
    background: var(--st-surface-2);
    border-color: var(--st-hair);
  }

  .ft-opt-btn.active,
  .ft-opt-btn.active:hover:not(:disabled) {
    background: var(--st-accent);
    border-color: var(--st-danger);
    color: white;
  }

  .ft-selfweight-toggle {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 0.68rem;
    color: var(--st-text-2);
    cursor: pointer;
    white-space: nowrap;
  }
  .ft-selfweight-toggle input {
    accent-color: var(--st-accent);
    margin: 0;
  }
  .ft-selfweight-toggle span {
    font-weight: 600;
    color: var(--st-text);
  }

  .ft-case-select {
    background: var(--st-surface-2);
    color: var(--st-text);
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    padding: 2px 4px;
    font-size: 0.7rem;
    cursor: pointer;
  }

  .ft-case-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .ft-sep {
    color: var(--st-text-3);
    font-size: 0.8rem;
    margin: 0 2px;
  }

  .ft-input-group {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 0.7rem;
    color: var(--st-text-2);
  }

  .ft-input-group :global(input) {
    width: 55px;
    padding: 2px 4px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    color: var(--st-text);
    font-size: 0.7rem;
  }

  .ft-unit {
    font-size: 0.68rem;
    color: var(--st-text-2);
    white-space: nowrap;
  }

  .ft-dir-btn {
    min-width: 24px;
    font-size: 0.65rem;
    padding: 2px 4px;
  }

  .ft-coord-btn {
    min-width: 22px;
    font-size: 0.6rem;
    padding: 2px 5px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  @media (max-width: 767px) {
    .ft-opt-btn {
      white-space: nowrap;
      font-size: 0.6rem;
      padding: 4px 6px;
    }

    .ft-input-group :global(input) {
      width: 45px;
    }

    .ft-input-group {
      font-size: 0.65rem;
    }

    .ft-unit {
      font-size: 0.68rem;
    }

    .ft-dir-btn {
      padding: 3px 5px;
      font-size: 0.6rem;
    }

    .ft-coord-btn {
      font-size: 0.55rem;
      letter-spacing: 0;
      padding: 2px 3px;
      min-width: 18px;
    }
  }
</style>
