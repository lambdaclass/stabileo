<script lang="ts">
  /**
   * The cube's menu: where the camera looks from, how it projects, the view's tools and, in Basic,
   * how the bars are drawn. PRO draws the bars from its View panel, which the menu opens, so a
   * choice is made in one place.
   */
  import Icon from './ribbon/Icon.svelte';
  import { t } from '../lib/i18n';
  import { uiStore } from '../lib/store/ui.svelte';
  import { buildTimelapse } from '../lib/store/build-timelapse.svelte';
  import { timelapseSound } from '../lib/viewport3d/timelapse-sound';
  import { BASIC_BAR_STYLES, basicBarStyle } from '../lib/viewport3d/view-menu';

  let { pro, onfit, onview, onprojection, onclose }: {
    pro: boolean;
    onfit: () => void;
    onview: (v: 'top' | 'front' | 'side') => void;
    onprojection: (m: 'perspective' | 'orthographic') => void;
    onclose: () => void;
  } = $props();

  const VIEWS = [['top', '⊤', 'viewport3d.topView'], ['front', '⊡', 'viewport3d.frontView'], ['side', '⊟', 'viewport3d.sideView']] as const;
  const PROJECTIONS = [['perspective', 'viewMenu.perspective'], ['orthographic', 'viewMenu.orthographic']] as const;
</script>

<div class="cam-menu" data-testid="cam-menu-pop">
  <button class="cam-item" onclick={() => { onfit(); onclose(); }} data-testid="cam-fit">
    <Icon name="fit" size={15} /><span>{t('viewport3d.zoomToFit')}</span>
  </button>
  <div class="cam-sep"></div>
  <span class="cam-group-title">{t('viewMenu.views')}</span>
  <div class="cam-row">
    {#each VIEWS as [v, glyph, key] (v)}
      <button class="cam-item cam-chip" onclick={() => { onview(v); onclose(); }} title={t(key)} data-testid="cam-view-{v}">
        <span class="cam-glyph">{glyph}</span><span>{t(key)}</span>
      </button>
    {/each}
  </div>
  <span class="cam-group-title">{t('viewMenu.projection')}</span>
  <div class="cam-seg" role="radiogroup" aria-label={t('viewMenu.projection')}>
    {#each PROJECTIONS as [m, key] (m)}
      <button class:on={uiStore.cameraMode3D === m} role="radio" aria-checked={uiStore.cameraMode3D === m}
              onclick={() => onprojection(m)} data-testid="cam-projection-{m}">{t(key)}</button>
    {/each}
  </div>
  <div class="cam-sep"></div>
  <button class="cam-item" class:on={uiStore.planView3D} onclick={() => { uiStore.planView3D = !uiStore.planView3D; }}
          title={uiStore.planView3D ? t('viewport.planViewOff') : t('viewport.planViewOn')} data-testid="nav-plan-view">
    <span class="cam-glyph">▦</span><span>{t('viewport.planView')}</span><span class="cam-tick" aria-hidden="true">{uiStore.planView3D ? '✓' : ''}</span>
  </button>
  <button class="cam-item" class:on={uiStore.clippingEnabled} onclick={() => { uiStore.clippingEnabled = !uiStore.clippingEnabled; }} data-testid="cam-clipping">
    <span class="cam-glyph">✂</span><span>{t('viewMenu.clipping')}</span><span class="cam-tick" aria-hidden="true">{uiStore.clippingEnabled ? '✓' : ''}</span>
  </button>
  <button class="cam-item" class:on={uiStore.measureMode} onclick={() => { uiStore.measureMode = !uiStore.measureMode; }} data-testid="cam-measure">
    <span class="cam-glyph">📏</span><span>{t('viewMenu.measure')}</span><span class="cam-tick" aria-hidden="true">{uiStore.measureMode ? '✓' : ''}</span>
  </button>
  <button class="cam-item" class:on={buildTimelapse.active} data-testid="cam-build-timelapse"
          onclick={() => { if (buildTimelapse.active) buildTimelapse.close(); else { timelapseSound.unlock(); buildTimelapse.open(); } onclose(); }}>
    <span class="cam-glyph">▶</span><span>{t('timelapse.menu')}</span>
  </button>
  <div class="cam-sep"></div>
  {#if pro}
    <button class="cam-item" onclick={() => { uiStore.proActiveTab = 'view'; onclose(); }} title={t('viewMenu.moreHint')} data-testid="cam-more-view">
      <span class="cam-glyph">⋯</span><span>{t('viewMenu.more')}</span>
    </button>
  {:else}
    <span class="cam-group-title">{t('viewMenu.bars')}</span>
    <div class="cam-seg" role="radiogroup" aria-label={t('viewMenu.bars')} data-testid="cam-render">
      {#each BASIC_BAR_STYLES as s (s.style)}
        <button class:on={basicBarStyle(uiStore.renderMode3D) === s.style} role="radio" aria-checked={basicBarStyle(uiStore.renderMode3D) === s.style}
                onclick={() => { uiStore.renderMode3D = s.mode; }} title={t(s.hint)} data-testid="cam-bars-{s.style}">{t(s.label)}</button>
      {/each}
    </div>
  {/if}
</div>
