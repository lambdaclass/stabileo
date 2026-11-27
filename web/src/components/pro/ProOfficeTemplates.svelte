<script lang="ts">
  import Hint from './Hint.svelte';
  /**
   * The office's project templates (`store/office-templates.ts`): save the open project's
   * materials, sections, cases, combinations, rules, regulations and deflection limits as a
   * template, apply one to the open project, and move them between machines as files.
   */
  import { t, tp } from '../../lib/i18n';
  import { modelStore } from '../../lib/store';
  import { listTemplates, saveTemplate, removeTemplate, importTemplate, applyTemplate, templateFromProject } from '../../lib/store/office-templates';
  import { TemplateError, type OfficeTemplate } from '../../lib/model/office-template';
  import { downloadText } from '../../lib/store/file';

  let list = $state<OfficeTemplate[]>(listTemplates());
  let name = $state(modelStore.model.name || '');
  let message = $state<string | null>(null);
  let fileInput: HTMLInputElement | undefined = $state();
  const refresh = () => (list = listTemplates());

  function save() {
    const n = name.trim();
    if (!n) return;
    message = saveTemplate(templateFromProject(n)) ? tp('templates.saved', { name: n }) : t('templates.storageFull');
    refresh();
  }
  function apply(tpl: OfficeTemplate) {
    const p = applyTemplate(tpl);
    const r = p.regulationChanges;
    message = [
      tp('templates.applied', {
        name: tpl.name, materials: p.materials.length, sections: p.sections.length,
        cases: p.loadCases.length, combos: p.combinations.length,
      }),
      // A load-affecting code is staged, as in the regulations panel: its loads are reviewed first.
      r.review.length ? tp('templates.regulationsReview', { roles: r.review.join(', ') }) : '',
      r.refused.length ? tp('templates.regulationsRefused', { roles: r.refused.join(', ') }) : '',
    ].filter(Boolean).join(' ');
  }
  const exportFile = (tpl: OfficeTemplate) => downloadText(JSON.stringify(tpl, null, 1), `${tpl.name.replace(/[^\w.-]+/g, '-')}.stabileo-template.json`, 'application/json');
  async function onFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try { const tpl = importTemplate(await f.text()); message = tp('templates.imported', { name: tpl.name }); refresh(); }
    catch (err) { message = err instanceof TemplateError ? t(`templates.error.${err.message}`) : String(err); }
    (e.target as HTMLInputElement).value = '';
  }
</script>

<div class="ot" data-testid="office-templates">
  <Hint text={t('templates.hint')} />
  <div class="ot-row">
    <input bind:value={name} placeholder={t('templates.name')} data-testid="ot-name" />
    <button class="ot-btn ot-primary" disabled={!name.trim()} onclick={save} data-testid="ot-save">{t('templates.save')}</button>
    <button class="ot-btn" onclick={() => fileInput?.click()} data-testid="ot-import">{t('templates.import')}</button>
    <input type="file" accept=".json,application/json" hidden bind:this={fileInput} onchange={onFile} />
  </div>
  {#if message}<p class="ot-hint" data-testid="ot-message">{message}</p>{/if}
  {#if list.length}
    <ul class="ot-list">
      {#each list as tpl (tpl.name)}
        <li class="ot-item" data-testid="ot-template">
          <span class="ot-text">
            <span class="ot-name">{tpl.name}</span>
            <span class="ot-meta">{tp('templates.contents', { materials: tpl.materials.length, sections: tpl.sections.length, combos: tpl.combinations.length })}</span>
          </span>
          <button class="ot-btn" onclick={() => apply(tpl)} data-testid="ot-apply">{t('templates.apply')}</button>
          <button class="ot-btn" onclick={() => exportFile(tpl)}>{t('templates.export')}</button>
          <button class="ot-btn ot-x" onclick={() => { removeTemplate(tpl.name); refresh(); }} aria-label={t('templates.remove')} title={t('templates.remove')}>×</button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .ot { display: flex; flex-direction: column; gap: 8px; }
  .ot-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .ot-row input {
    flex: 1;
    min-width: 160px;
    height: 30px;
    padding: 0 8px;
    background: var(--st-surface);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font: inherit;
    font-size: 0.78rem;
  }
  .ot-row input:focus-visible { outline: 2px solid var(--st-focus); outline-offset: 1px; }
  .ot-btn {
    flex: none;
    height: 30px;
    padding: 0 10px;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    font: inherit;
    font-size: 0.76rem;
    white-space: nowrap;
    cursor: pointer;
  }
  .ot-btn:hover:not(:disabled) { background: var(--st-surface-3); color: var(--st-text); }
  .ot-btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .ot-primary { border-color: var(--st-interactive); color: var(--st-text); font-weight: 600; }
  .ot-x { width: 30px; padding: 0; }
  .ot-list { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; border: 1px solid var(--st-hair); border-radius: var(--st-radius); }
  .ot-item { display: flex; gap: 6px; align-items: center; padding: 8px 10px; }
  .ot-item + .ot-item { border-top: 1px solid var(--st-hair); }
  .ot-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .ot-name { font-size: 0.8rem; font-weight: 600; color: var(--st-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ot-meta { font-size: 0.68rem; color: var(--st-text-3); }
  .ot-hint { margin: 0; font-size: 0.72rem; color: var(--st-text-2); }
</style>
