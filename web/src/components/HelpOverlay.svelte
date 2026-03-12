<script lang="ts">
  import { uiStore } from '../lib/store';
  import { t } from '../lib/i18n';
</script>

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
  .help-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .help-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
  }

  .help-content {
    position: relative;
    background: #16213e;
    border: 1px solid #0f3460;
    border-radius: 8px;
    padding: 1.5rem 2rem;
    max-width: 600px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }

  .help-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .help-header h2 {
    font-size: 1.1rem;
    color: #4ecdc4;
    margin: 0;
  }

  .help-close {
    background: none;
    border: none;
    color: #888;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0.25rem;
  }

  .help-close:hover {
    color: #eee;
  }

  .help-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
  }

  .help-col h3 {
    font-size: 0.75rem;
    text-transform: uppercase;
    color: #888;
    letter-spacing: 0.05em;
    margin: 0.75rem 0 0.4rem 0;
  }

  .help-col h3:first-child {
    margin-top: 0;
  }

  .shortcut {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: #ccc;
    padding: 0.15rem 0;
  }

  .help-content :global(kbd) {
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 3px;
    padding: 0.1rem 0.4rem;
    font-family: monospace;
    font-size: 0.75rem;
    color: #e94560;
    min-width: 1.5rem;
    text-align: center;
  }

  .help-hint {
    text-align: center;
    color: #666;
    font-size: 0.75rem;
    margin-top: 1rem;
    margin-bottom: 0;
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
