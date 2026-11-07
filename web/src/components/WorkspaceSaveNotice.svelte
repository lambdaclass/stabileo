<script lang="ts">
  import { workspaceSaveStatus } from '../lib/store/workspace-save-status.svelte';
  import { saveSession } from '../lib/store/file';
  import { t } from '../lib/i18n';
</script>

{#if workspaceSaveStatus.failed}
  <div class="workspace-save-notice" role="alert" data-testid="workspace-save-notice">
    <p>{t('file.workspaceNotSaved')}</p>
    <button type="button" data-testid="workspace-save-session" onclick={() => saveSession()}>{t('file.workspaceSaveToFile')}</button>
  </div>
{/if}

<style>
  .workspace-save-notice {
    position: fixed;
    top: calc(8px + env(safe-area-inset-top, 0px));
    left: 50%;
    transform: translateX(-50%);
    z-index: 1150;
    box-sizing: border-box;
    width: max-content;
    max-width: min(640px, calc(100vw - 32px));
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border: 2px solid #b42318;
    border-radius: 6px;
    background: #fff0ee;
    color: #7a1610;
    font-size: 13px;
    line-height: 1.35;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }
  p { margin: 0; flex: 1; min-width: 0; overflow-wrap: anywhere; }
  button {
    flex: none;
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid currentColor;
    border-radius: 4px;
    background: #fff;
    color: inherit;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  @media (max-width: 640px) {
    .workspace-save-notice { flex-wrap: wrap; gap: 8px; font-size: 13px; }
    button { width: 100%; }
  }
</style>
