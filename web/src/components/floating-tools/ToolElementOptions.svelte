<script lang="ts">
  /**
   * The member tool's options: what a member is (rigid or pinned), how clicks
   * string members (single line or polyline) and, in 2D, the dimensions tag
   * while a member is stretched. Each choice is a segmented pair; on a phone
   * (DataTable) each pair is a row of wide buttons.
   */
  import ToolGlyph from './ToolGlyph.svelte';
  import { uiStore } from '../../lib/store';
  import { t } from '../../lib/i18n';

  const is3D = $derived(uiStore.is3DWorkspace);
  const hintKey = $derived(
    (uiStore.memberDrawMode === 'polyline' ? 'float.elementHintPolyline' : 'float.elementHintSingle')
      + (is3D ? '3d' : ''),
  );
</script>

<span class="ft-seg" role="group" aria-label={t('float.memberTypeGroup')}>
  <button class="ft-opt-btn ft-primary" class:active={uiStore.elementCreateType === 'frame'}
    aria-pressed={uiStore.elementCreateType === 'frame'}
    onclick={() => uiStore.elementCreateType = 'frame'} data-testid="member-type-frame"
  ><ToolGlyph name="frameRigid" />{t('float.elementRigid')}</button>
  <button class="ft-opt-btn ft-primary" class:active={uiStore.elementCreateType === 'truss'}
    aria-pressed={uiStore.elementCreateType === 'truss'}
    onclick={() => uiStore.elementCreateType = 'truss'} data-testid="member-type-truss"
  ><ToolGlyph name="trussPinned" />{t('float.elementTruss')}</button>
</span>
<span class="ft-break" aria-hidden="true"></span>
<span class="ft-seg" role="group" aria-label={t('float.memberModeGroup')}>
  <button class="ft-opt-btn ft-primary ft-second" class:active={uiStore.memberDrawMode === 'single'}
    aria-pressed={uiStore.memberDrawMode === 'single'} title={t('float.memberSingleTip')}
    onclick={() => uiStore.memberDrawMode = 'single'} data-testid="member-mode-single"
  ><ToolGlyph name="lineSingle" />{t('float.memberSingle')}</button>
  <button class="ft-opt-btn ft-primary ft-second" class:active={uiStore.memberDrawMode === 'polyline'}
    aria-pressed={uiStore.memberDrawMode === 'polyline'} title={t('float.memberPolylineTip')}
    onclick={() => uiStore.memberDrawMode = 'polyline'} data-testid="member-mode-polyline"
  ><ToolGlyph name="polyline" />{t('float.memberPolyline')}</button>
</span>
<span class="ft-break" aria-hidden="true"></span>
{#if !is3D}
  <button class="ft-opt-btn ft-dims" class:active={uiStore.showMemberDimensions}
    aria-pressed={uiStore.showMemberDimensions} title={t('float.memberDimsTip')}
    onclick={() => uiStore.showMemberDimensions = !uiStore.showMemberDimensions} data-testid="member-dims"
  ><ToolGlyph name="dimensions" />{t('float.memberDims')}</button>
{/if}
<span class="ft-hint">{t(hintKey)}</span>

<style>
  /* A row break for the phone's layout (DataTable); nothing on a desktop. */
  .ft-break { display: none; }

  /* Two buttons joined into one control. */
  .ft-seg {
    display: inline-flex;
    align-items: stretch;
  }
  .ft-seg + .ft-break + .ft-seg,
  .ft-seg + .ft-break + .ft-dims,
  .ft-seg + .ft-break + .ft-hint { margin-left: 8px; }

  .ft-opt-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 9px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    color: var(--st-text-2);
    cursor: pointer;
    font-size: 0.7rem;
    white-space: nowrap;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .ft-opt-btn:hover { background: var(--st-surface-3); color: var(--st-text); }
  .ft-opt-btn.active {
    background: var(--st-accent);
    border-color: var(--st-danger);
    color: white;
  }
  .ft-seg .ft-opt-btn { border-radius: 0; }
  .ft-seg .ft-opt-btn:first-child { border-radius: 4px 0 0 4px; }
  .ft-seg .ft-opt-btn:last-child { border-radius: 0 4px 4px 0; margin-left: -1px; }
  /* The on/off switch reads as one: outlined in the accent when on. */
  .ft-dims.active {
    background: var(--st-surface-2);
    border-color: var(--st-accent);
    color: var(--st-accent);
  }

  .ft-hint {
    font-size: 0.65rem;
    color: var(--st-text-3);
    margin-left: 4px;
  }

  /*
   * The phone's sheet: each pair becomes a row of wide, separate buttons
   * (DataTable sizes them), and the switch and the hint share the last row.
   */
  :global(.dt-tool-options) .ft-seg { display: contents; }
  :global(.dt-tool-options) .ft-seg .ft-opt-btn,
  :global(.dt-tool-options) .ft-seg .ft-opt-btn:first-child,
  :global(.dt-tool-options) .ft-seg .ft-opt-btn:last-child {
    border-radius: var(--st-radius);
    margin-left: 0;
  }
  :global(.dt-tool-options) .ft-hint { font-size: 0.72rem; margin-left: 0; flex: 1 1 12rem; }
</style>
