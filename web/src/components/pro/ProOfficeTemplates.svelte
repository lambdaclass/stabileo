<script lang="ts">
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

<details class="ot" data-testid="office-templates">
  <summary class="pp-heading">{t('templates.title')}{list.length ? ` · ${list.length}` : ''}</summary>
  <p class="ot-hint">{t('templates.hint')}</p>
  <div class="ot-row">
    <input bind:value={name} placeholder={t('templates.name')} data-testid="ot-name" />
    <button class="pp-btn" disabled={!name.trim()} onclick={save} data-testid="ot-save">{t('templates.save')}</button>
    <button class="pp-btn" onclick={() => fileInput?.click()} data-testid="ot-import">{t('templates.import')}</button>
    <input type="file" accept=".json,application/json" hidden bind:this={fileInput} onchange={onFile} />
  </div>
  {#each list as tpl (tpl.name)}
    <div class="ot-row" data-testid="ot-template">
      <span class="ot-name">{tpl.name}</span>
      <span class="ot-meta">{tp('templates.contents', { materials: tpl.materials.length, sections: tpl.sections.length, combos: tpl.combinations.length })}</span>
      <button class="pp-btn" onclick={() => apply(tpl)} data-testid="ot-apply">{t('templates.apply')}</button>
      <button class="pp-btn" onclick={() => exportFile(tpl)}>{t('templates.export')}</button>
      <button class="pp-btn ot-x" onclick={() => { removeTemplate(tpl.name); refresh(); }} aria-label={t('templates.remove')}>×</button>
    </div>
  {/each}
  {#if message}<p class="ot-hint" data-testid="ot-message">{message}</p>{/if}
</details>

<style>
  .ot summary { cursor: pointer; }
  .ot-row { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; margin: 4px 0; font-size: 0.66rem; }
  .ot-row input { flex: 1; min-width: 120px; }
  .ot-name { font-weight: 600; color: var(--st-text); }
  .ot-meta { flex: 1; color: var(--st-text-3); font-size: 0.6rem; }
  .ot-x { padding: 0 6px; }
  .ot-hint { margin: 4px 0; font-size: 0.6rem; color: var(--st-text-3); }
</style>
