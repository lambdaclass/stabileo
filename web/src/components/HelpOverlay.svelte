<script lang="ts">
  import { uiStore } from '../lib/store';
  import { t } from '../lib/i18n';
</script>

<!--
  Escape closes it. The backdrop was the only way out besides the ✕, which is
  the one gesture nobody tries first on a modal — and this is the dialog a user
  opens to learn the keyboard, so it not answering the keyboard is its own
  small joke.
-->
<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && uiStore.showHelp) uiStore.showHelp = false; }} />

{#if uiStore.showHelp}
  <div class="help-overlay" role="dialog" aria-label={t('help.title')}>
    <div class="help-backdrop" onclick={() => uiStore.showHelp = false}></div>
    <div class="help-content">
      <div class="help-header">
        <h2>{t('help.title')}</h2>
        <button class="help-close" onclick={() => uiStore.showHelp = false}>✕</button>
      </div>
      <div class="help-columns">
        <div class="help-col">
          <h3>{t('help.tools')}</h3>
          <div class="shortcut"><kbd>V</kbd> {t('help.select')}</div>
          <div class="shortcut"><kbd>N</kbd> {t('help.node')}</div>
          <div class="shortcut"><kbd>E</kbd> {t('help.element')}</div>
          <div class="shortcut"><kbd>S</kbd> {t('help.support')}</div>
          <div class="shortcut"><kbd>L</kbd> {t('help.load')}</div>
          <div class="shortcut"><kbd>A</kbd> {t('help.pan')}</div>
          <h3>{t('help.editing')}</h3>
          <div class="shortcut"><kbd>Ctrl+Z</kbd> {t('help.undo')}</div>
          <div class="shortcut"><kbd>Ctrl+Y</kbd> {t('help.redo')}</div>
          <div class="shortcut"><kbd>Ctrl+A</kbd> {t('help.selectAll')}</div>
          <div class="shortcut"><kbd>Ctrl+C</kbd> {t('help.copy')}</div>
          <div class="shortcut"><kbd>Ctrl+X</kbd> {t('help.cut')}</div>
          <div class="shortcut"><kbd>Ctrl+V</kbd> {t('help.paste')}</div>
          <div class="shortcut"><kbd>Del</kbd> {t('help.delete')}</div>
        </div>
        <div class="help-col">
          <h3>{t('help.view')}</h3>
          <div class="shortcut"><kbd>G</kbd> {t('help.toggleGrid')}</div>
          <div class="shortcut"><kbd>H</kbd> {t('help.toggleAxes')}</div>
          <div class="shortcut"><kbd>F</kbd> {t('help.fitModel')}</div>
          {#if uiStore.analysisMode === 'pro' || uiStore.analysisMode === '3d'}
            <div class="shortcut"><kbd>Alt+Z</kbd> {t('view.zoomSelection')}</div>
            <div class="shortcut"><kbd>Alt+N</kbd> {t('view.labelNodes')}</div>
            <div class="shortcut"><kbd>Alt+B</kbd> {t('view.labelMembers')}</div>
            <div class="shortcut"><kbd>Alt+M</kbd> {t('view.memberLabelShows')}</div>
            <div class="shortcut"><kbd>Alt+L</kbd> {t('view.labelLengths')}</div>
            <div class="shortcut"><kbd>Alt+P</kbd> {t('view.labelShells')}</div>
          {/if}
          {#if uiStore.analysisMode !== '3d'}
            <div class="shortcut"><kbd>+</kbd> {t('help.zoomIn')}</div>
            <div class="shortcut"><kbd>-</kbd> {t('help.zoomOut')}</div>
          {/if}
          <div class="shortcut"><kbd>Esc</kbd> {t('help.cancelDeselect')}</div>
          <h3>{t('help.diagrams')}</h3>
          <div class="shortcut"><kbd>0</kbd> {t('help.diagramNone')}</div>
          <div class="shortcut"><kbd>1</kbd> {t('help.diagramDeformed')}</div>
          {#if uiStore.analysisMode !== '3d'}
            <div class="shortcut"><kbd>2</kbd> {t('help.diagramShear')}</div>
            <div class="shortcut"><kbd>3</kbd> {t('help.diagramMoment')}</div>
          {:else}
            <div class="shortcut"><kbd>2</kbd> {t('help.diagramShearZ')}</div>
            <div class="shortcut"><kbd>3</kbd> {t('help.diagramMomentY')}</div>
            <div class="shortcut"><kbd>4</kbd> {t('help.diagramShearY')}</div>
            <div class="shortcut"><kbd>5</kbd> {t('help.diagramMomentZ')}</div>
            <div class="shortcut"><kbd>6</kbd> {t('help.diagramTorsion')}</div>
          {/if}
          <div class="shortcut"><kbd>7</kbd> {t('help.diagramAxial')}</div>
          <div class="shortcut"><kbd>8</kbd> {t('help.diagramAxialColors')}</div>
          <div class="shortcut"><kbd>9</kbd> {t('help.diagramColorMap')}</div>
          <h3>{t('help.fileCalc')}</h3>
          <div class="shortcut"><kbd>Ctrl+S</kbd> {t('help.saveTab')}</div>
          <div class="shortcut"><kbd>Ctrl+Shift+S</kbd> {t('help.saveSession')}</div>
          <div class="shortcut"><kbd>Ctrl+O</kbd> {t('help.open')}</div>
          <div class="shortcut"><kbd>Enter</kbd> {t('help.solve')}</div>
        </div>
      </div>
      <p class="help-hint">{t('help.closeHint')}</p>
    </div>
  </div>
{/if}

<style>
  /*
     The shortcuts dialog, on the application's design system.
     ────────────────────────────────────────────────────────
     This kept the pre-token palette wholesale: a #16213e card on a #0f3460
     border, a turquoise heading and pink keycaps — so the one panel a new user
     opens to learn the application looked like a different application.

     The keycaps carry the mono face and the hairline the rest of the shell
     uses; the shortcut letter is a value the user reads off, so it takes the
     value colour rather than the accent, which is reserved for what they are
     acting on.
  */
  .help-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--st-sans);
  }

  .help-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(12, 22, 32, 0.72);
    backdrop-filter: blur(2px);
  }

  .help-content {
    position: relative;
    background: var(--st-surface);
    border: 1px solid var(--st-hair);
    border-radius: var(--st-radius-lg);
    padding: 1.4rem 1.6rem;
    max-width: 620px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
  }

  .help-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 0.7rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--st-hair);
  }

  .help-header h2 {
    font-family: var(--st-mono);
    font-size: 0.72rem;
    font-weight: 400;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--st-text-2);
    margin: 0;
  }

  .help-close {
    background: none;
    border: none;
    color: var(--st-text-3);
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
    padding: 0.1rem 0.35rem;
    border-radius: var(--st-radius);
  }

  .help-close:hover { background: var(--st-surface-3); color: var(--st-text); }

  .help-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
  }

  .help-col h3 {
    font-family: var(--st-mono);
    font-size: 0.64rem;
    font-weight: 400;
    text-transform: uppercase;
    color: var(--st-text-3);
    letter-spacing: 0.11em;
    margin: 1rem 0 0.4rem 0;
  }

  .help-col h3:first-child { margin-top: 0; }

  .shortcut {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    font-size: 0.8rem;
    color: var(--st-text-2);
    padding: 0.18rem 0;
  }

  .help-content :global(kbd) {
    background: var(--st-surface-3);
    border: 1px solid var(--st-hair);
    border-bottom-width: 2px;
    border-radius: var(--st-radius);
    padding: 0.12rem 0.42rem;
    font-family: var(--st-mono);
    font-size: 0.72rem;
    color: var(--st-value);
    min-width: 1.6rem;
    text-align: center;
    flex: none;
  }

  .help-hint {
    text-align: center;
    color: var(--st-text-3);
    font-size: 0.72rem;
    margin: 1.2rem 0 0;
    padding-top: 0.8rem;
    border-top: 1px solid var(--st-hair);
  }

  @media (max-width: 767px) {
    .help-columns {
      grid-template-columns: 1fr;
      gap: 0.5rem;
    }

    .help-content {
      padding: 1rem;
      max-width: 95%;
    }
  }
</style>
