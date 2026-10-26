<script lang="ts">
  /** The set kept as an office template in this browser: saved from the project, applied to another, removed. */
  import { t, tp } from '../../../lib/i18n';
  import { applySetTemplate, listSetTemplates, removeSetTemplate, saveSetTemplate, setTemplateFromProject } from '../../../lib/store/sheet-set';

  let { onApplied }: { onApplied: () => void } = $props();
  let name = $state(''), rev = $state(0), note = $state<string | null>(null);
  const list = $derived.by(() => { void rev; return listSetTemplates(); });
  function save() {
    const n = name.trim();
    if (!n) return;
    note = saveSetTemplate(setTemplateFromProject(n)) ? tp('sheet.ui.tplSaved', { name: n }) : t('sheet.ui.tplNotSaved');
    rev++; name = '';
  }
</script>

<details class="st" data-testid="sheets-templates">
  <summary>{tp('sheet.ui.templates', { n: list.length })}</summary>
  <div class="row">
    <input placeholder={t('sheet.ui.tplName')} bind:value={name} data-testid="sheets-tpl-name" />
    <button disabled={!name.trim()} onclick={save} data-testid="sheets-tpl-save">{t('sheet.ui.tplSave')}</button>
  </div>
  <ul>
    {#each list as tpl (tpl.name)}
      <li>
        <span>{tpl.name} · {tp('sheet.ui.entriesSummary', { n: tpl.entries.length })} · {tpl.format}</span>
        <button onclick={() => { applySetTemplate(tpl); note = tp('sheet.ui.tplApplied', { name: tpl.name }); onApplied(); }} data-testid="sheets-tpl-apply-{tpl.name}">{t('sheet.ui.tplApply')}</button>
        <button aria-label={t('sheet.ui.remove')} onclick={() => { removeSetTemplate(tpl.name); rev++; }}>×</button>
      </li>
    {/each}
  </ul>
  {#if note}<p class="muted" role="status">{note}</p>{/if}
</details>

<style>
  .st summary { font-size: 0.68rem; cursor: pointer; color: var(--st-text); }
  .st { font-size: 0.66rem; color: var(--st-text-2); }
  .row { display: flex; gap: 0.3rem; margin: 0.25rem 0; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.15rem; }
  li { display: flex; align-items: center; gap: 0.3rem; }
  input, button { font-size: 0.66rem; padding: 0.05rem 0.3rem; background: var(--st-surface-2); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 3px; }
  button { cursor: pointer; }
  button:disabled { opacity: 0.45; }
  .muted { margin: 0; }
</style>
