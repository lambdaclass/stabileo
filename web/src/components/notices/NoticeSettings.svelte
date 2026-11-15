<script lang="ts">
  import { t } from '../../lib/i18n';
  import { noticePrefs } from '../../lib/store/notice-prefs.svelte';
  import { HIDEABLE_KINDS } from '../../lib/store/result-notices';
</script>

<details class="ns" data-testid="cfg-result-notices">
  <summary>{t('notices.settings.title')}{#if noticePrefs.hidden.length} · {noticePrefs.hidden.length}{/if}</summary>
  <p class="ns-hint">{t('notices.settings.hint')}</p>
  {#each HIDEABLE_KINDS as kind (kind)}
    <label class="ns-row">
      <input type="checkbox" checked={!noticePrefs.isHidden(kind)} data-testid="cfg-notice-{kind}"
        onchange={(e) => (e.currentTarget.checked ? noticePrefs.show(kind) : noticePrefs.hide(kind))} />
      <span>{t(`notices.label.${kind}`)}</span>
    </label>
  {/each}
  <button type="button" class="ns-all" disabled={noticePrefs.hidden.length === 0} onclick={() => noticePrefs.showAll()} data-testid="cfg-notices-show-all">{t('notices.settings.showAll')}</button>
</details>

<style>
  .ns { margin: 4px 0; font-size: 12px; color: var(--st-text-2); }
  .ns summary { cursor: pointer; min-height: 28px; display: flex; align-items: center; }
  .ns-hint { margin: 2px 0 6px; font-size: 12px; line-height: 1.4; color: var(--st-text-3); }
  .ns-row { display: flex; align-items: center; gap: 6px; min-height: 26px; cursor: pointer; }
  .ns-all { margin-top: 6px; min-height: 28px; padding: 0 8px; border: 1px solid var(--st-hair); border-radius: 4px; background: transparent; color: var(--st-text-2); font: inherit; cursor: pointer; }
  .ns-all:disabled { opacity: 0.5; cursor: default; }
</style>
