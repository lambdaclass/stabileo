<script lang="ts">
  /**
   * User templates: a piece of structure saved by name and placed again with the ghost.
   *
   * A template is the model code of a fragment, so sharing one is sharing text: copy it, send
   * it, paste it into the import box of another installation. They are kept in this browser's
   * storage; a template that has to travel with a project is better saved as a group in it.
   */
  import { t, tp } from '../../../lib/i18n';
  import { uiStore } from '../../../lib/store/ui.svelte';
  import { placementStore } from '../../../lib/store/placement.svelte';
  import { selectionSet } from '../../../lib/store/model-clipboard';
  import { detach, fragmentOf } from '../../../lib/model/edit/fragment';
  import { fragmentFromCode, fragmentToCode } from '../../../lib/model/edit/fragment-code';

  const KEY = 'stabileo.userTemplates.v1';
  interface Template { name: string; code: string }

  function load(): Template[] {
    try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  }
  let templates = $state<Template[]>(load());
  function save(next: Template[]) {
    templates = next;
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked: kept for this session */ }
  }

  let name = $state('');
  let importText = $state('');
  let importName = $state('');
  let message = $state<string | null>(null);

  const selectionSize = $derived(uiStore.selectedElements.size + uiStore.selectedShells.size + uiStore.selectedNodes.size);

  function saveSelection() {
    const set = selectionSet();
    const frag = detach(fragmentOf(set, { withLoads: false, withSupports: true }));
    if (frag.nodes.length === 0) return;
    const n = name.trim() || tp('templates.defaultName', { n: templates.length + 1 });
    save([...templates.filter((x) => x.name !== n), { name: n, code: fragmentToCode(frag) }]);
    name = '';
    message = tp('templates.saved', { name: n });
  }

  function place(tpl: Template) {
    const frag = fragmentFromCode(tpl.code);
    if (!frag) { message = t('templates.unreadable'); return; }
    placementStore.start({ fragment: frag, label: tpl.name });
  }

  async function copy(tpl: Template) {
    try { await navigator.clipboard.writeText(tpl.code); message = tp('templates.copied', { name: tpl.name }); }
    catch { message = t('templates.copyFailed'); }
  }

  function importCode() {
    const frag = fragmentFromCode(importText);
    if (!frag) { message = t('templates.unreadable'); return; }
    const n = importName.trim() || tp('templates.defaultName', { n: templates.length + 1 });
    save([...templates.filter((x) => x.name !== n), { name: n, code: importText.trim() + '\n' }]);
    importText = ''; importName = '';
    message = tp('templates.saved', { name: n });
  }
</script>

<section class="tp" data-testid="templates">
  <h4>{t('templates.title')}</h4>
  <p class="tp-hint">{t('templates.hint')}</p>
  <div class="tp-row">
    <input placeholder={t('templates.namePlaceholder')} bind:value={name} data-testid="tpl-name" />
    <button type="button" disabled={selectionSize === 0} onclick={saveSelection} data-testid="tpl-save">{t('templates.saveSelection')}</button>
  </div>
  {#if templates.length > 0}
    <ul class="tp-list">
      {#each templates as tpl (tpl.name)}
        <li data-testid="tpl-{tpl.name}">
          <span class="tp-name">{tpl.name}</span>
          <button type="button" onclick={() => place(tpl)} data-testid="tpl-place-{tpl.name}">{t('templates.place')}</button>
          <button type="button" onclick={() => copy(tpl)}>{t('templates.copyCode')}</button>
          <button type="button" onclick={() => save(templates.filter((x) => x !== tpl))}>{t('templates.delete')}</button>
        </li>
      {/each}
    </ul>
  {/if}
  <details>
    <summary>{t('templates.import')}</summary>
    <textarea rows="4" bind:value={importText} placeholder="stabileo-model 1 …" data-testid="tpl-import-text"></textarea>
    <div class="tp-row">
      <input placeholder={t('templates.namePlaceholder')} bind:value={importName} />
      <button type="button" disabled={!importText.trim()} onclick={importCode} data-testid="tpl-import">{t('templates.importButton')}</button>
    </div>
  </details>
  {#if message}<p class="tp-hint" role="status">{message}</p>{/if}
</section>

<style>
  .tp { display: flex; flex-direction: column; gap: 4px; font-size: 0.7rem; }
  h4 { margin: 6px 0 2px; font-size: 0.74rem; font-weight: 600; color: var(--st-text-2); }
  .tp-hint { margin: 0; font-size: 0.62rem; color: var(--st-text-3); }
  .tp-row { display: flex; gap: 4px; align-items: center; }
  .tp-row input { flex: 1; min-width: 0; }
  .tp-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
  .tp-list li { display: flex; gap: 4px; align-items: center; }
  .tp-name { flex: 1; font-weight: 600; color: var(--st-text); }
  button { padding: 2px 8px; font-size: 0.64rem; cursor: pointer; background: transparent; color: var(--st-text-2); border: 1px solid var(--st-hair); border-radius: 3px; }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
  textarea { width: 100%; font-family: var(--st-mono); font-size: 0.62rem; background: var(--st-bg); color: var(--st-text); border: 1px solid var(--st-surface-3); border-radius: 3px; }
</style>
