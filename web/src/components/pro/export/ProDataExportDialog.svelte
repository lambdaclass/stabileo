<script lang="ts">
  /**
   * Excel and CSV: the project's data, chosen sheet by sheet.
   *
   * Both buttons open this dialog, with their format chosen: the content is one choice and the
   * file another. Everything is on by default; what is turned off is remembered in this browser,
   * so a sheet added later starts on.
   *
   * "Puntos a lo largo de las barras" is what the panel's "Estaciones 5 / 13 / Críticas" was:
   * how many points of each member the station sheets read. It is offered only when one of those
   * sheets is chosen, and says which they are.
   */
  import { t, tp } from '../../../lib/i18n';
  import { modelStore, resultsStore, uiStore } from '../../../lib/store';
  import ExportDialog from '../../export/ExportDialog.svelte';
  import ExportSection from '../../export/ExportSection.svelte';
  import { MODEL_SHEET_NAMES } from '../../../lib/export/workbook-model';
  import { RESULT_SHEET_NAMES } from '../../../lib/export/workbook-results';
  import { downloadProjectCsv, downloadProjectWorkbook } from '../../../lib/store/project-workbook';
  import type { StationSpec } from '../../../lib/engine/station-forces';
  import { ensureProResults, hasShells } from '../../../lib/pro/export-results';
  import { modelIsEmpty, tellIfEmpty } from '../../../lib/export/empty-model';
  import CheckGroup from './CheckGroup.svelte';
  import OutdatedNotice from '../design/OutdatedNotice.svelte';

  let { open = $bindable(false), format = $bindable('xlsx') }: { open: boolean; format: 'xlsx' | 'csv' } = $props();

  /** The design as it stands (`store/design-exchange.ts`): decisions, every check, the verdict. */
  const DESIGN_SHEETS = ['Design elements', 'Design checks', 'Design verdict'];
  const MODEL: string[] = [...MODEL_SHEET_NAMES, 'Specifications', ...DESIGN_SHEETS];
  const RESULTS: string[] = [...RESULT_SHEET_NAMES, 'Physical member forces'];
  /** The sheets by topic, in the order a reader looks for them. */
  const MODEL_GROUPS: Array<{ key: string; sheets: string[] }> = [
    { key: 'geometry', sheets: ['Nodes', 'Members', 'Shells', 'Supports', 'Constraints', 'Groups'] },
    { key: 'properties', sheets: ['Materials', 'Sections', 'Specifications'] },
    { key: 'loads', sheets: ['LoadCases', 'LoadData', 'SelfWeight', 'Combinations'] },
    { key: 'design', sheets: DESIGN_SHEETS },
  ];
  const RESULT_GROUPS: Array<{ key: string; sheets: string[] }> = [
    { key: 'atNodes', sheets: ['Displacements', 'Reactions'] },
    { key: 'inMembers', sheets: ['EndForces', 'Stations', 'Deflections', 'Stresses', 'Physical member forces'] },
    { key: 'inShells', sheets: ['ShellCentres', 'ShellNodes', 'ShellCorners'] },
    { key: 'summaries', sheets: ['Maxima', 'Envelope', 'Statics', 'SecondOrder', 'OneWay', 'Cables'] },
  ];
  /** The sheets whose name alone does not say what is in them. */
  const HINTED = new Set(['Stations', 'ShellCentres', 'ShellNodes', 'ShellCorners', 'OneWay', 'Constraints']);
  /** Sheet names with spaces, as the workbook writes them, and the key that labels them. */
  const LABEL_KEY: Record<string, string> = {
    'Design elements': 'proExport.sheet.DesignElements', 'Design checks': 'proExport.sheet.DesignChecks',
    'Design verdict': 'proExport.sheet.DesignVerdict', 'Physical member forces': 'proExport.sheet.PhysicalForces',
  };
  const itemsOf = (sheets: string[], shown: string[]) => sheets.filter((n) => shown.includes(n))
    .map((n) => ({ id: n, label: t(LABEL_KEY[n] ?? `proExport.sheet.${n}`), hint: HINTED.has(n) ? t(`proExport.hint.${n}`) : undefined }));
  const SHELL_RESULTS = new Set(['ShellCentres', 'ShellNodes', 'ShellCorners']);
  /** The sheets read at points along the members. */
  const AT_STATIONS = new Set(['Stations', 'Deflections', 'Stresses', 'Maxima']);

  const KEY = 'stabileo-pro-data-export';
  interface Prefs { off: string[]; stations: StationSpec }
  function load(): Prefs {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>;
      const st = p.stations;
      return { off: Array.isArray(p.off) ? p.off : [], stations: st === 'critical' || st === 13 || st === 5 ? st : 5 };
    } catch { return { off: [], stations: 5 }; }
  }
  const prefs = load();
  let off = $state(new Set<string>(prefs.off));
  let stations = $state<StationSpec>(prefs.stations);
  /** Cases and combinations left out; none, by default and whenever the dialog opens. */
  let casesOff = $state(new Set<number>());
  let combosOff = $state(new Set<number>());
  let busy = $state(false);

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ off: [...off], stations })); } catch { /* this session only */ }
  }
  $effect(() => { if (open) { casesOff = new Set(); combosOff = new Set(); } });

  const shells = $derived(open && hasShells());
  const modelShown = $derived(MODEL.filter((n) => n !== 'Shells' || shells));
  const resultsShown = $derived(RESULTS.filter((n) => !SHELL_RESULTS.has(n) || shells));
  const on = (n: string) => !off.has(n);
  function flip(n: string) { const s = new Set(off); if (s.has(n)) s.delete(n); else s.add(n); off = s; save(); }
  function setAll(names: string[], value: boolean) { const s = new Set(off); for (const n of names) { if (value) s.delete(n); else s.add(n); } off = s; save(); }

  const cases = $derived(open ? modelStore.model.loadCases : []);
  const combos = $derived(open ? modelStore.combinations : []);
  function flipId(set: 'cases' | 'combos', id: number) {
    const s = new Set(set === 'cases' ? casesOff : combosOff);
    if (s.has(id)) s.delete(id); else s.add(id);
    if (set === 'cases') casesOff = s; else combosOff = s;
  }

  const modelCount = $derived(modelShown.filter(on).length);
  const resultCount = $derived(resultsShown.filter(on).length);
  const wantsResults = $derived(resultCount > 0);
  const wantsStations = $derived(resultsShown.some((n) => AT_STATIONS.has(n) && on(n)));

  const contentSummary = $derived(tp('proExport.dataContentSummary', { m: modelCount, mt: modelShown.length, r: resultCount, rt: resultsShown.length }));
  const setsSummary = $derived(casesOff.size === 0 && combosOff.size === 0
    ? t('proExport.setsAll')
    : tp('proExport.setsSome', { c: cases.length - casesOff.size, k: combos.length - combosOff.size }));
  const STATIONS: Array<{ id: StationSpec; key: string }> = [
    { id: 5, key: 'proExport.stations5' }, { id: 13, key: 'proExport.stations13' }, { id: 'critical', key: 'proExport.stationsCritical' },
  ];
  const stationsSummary = $derived(t(STATIONS.find((s) => s.id === stations)!.key));
  const formatSummary = $derived(format === 'xlsx' ? t('proExport.formatXlsx') : t('proExport.formatCsv'));

  async function run() {
    if (busy || modelCount + resultCount === 0) return;
    busy = true;
    try {
      let results = wantsResults;
      if (results && !(await ensureProResults())) {
        results = false;
        if (!modelIsEmpty()) uiStore.toast(t('proExport.dataNoResults'), 'info');
      }
      // Design's sheets only where design is on in PRO's settings (`uiStore.designInPro`).
      const sheets = new Set([...modelShown, ...(results ? resultsShown : [])].filter(on).filter((n) => uiStore.designInPro || !DESIGN_SHEETS.includes(n)));
      const opts = {
        results, sheets, design: uiStore.designInPro,
        sources: {
          cases: casesOff.size ? new Set(cases.map((c) => c.id).filter((id) => !casesOff.has(id))) : undefined,
          combinations: combosOff.size ? new Set(combos.map((c) => c.id).filter((id) => !combosOff.has(id))) : undefined,
        },
      };
      if (format === 'xlsx') await downloadProjectWorkbook(stations, opts);
      else await downloadProjectCsv(stations, opts);
      tellIfEmpty();
      open = false;
    } finally {
      busy = false;
    }
  }
</script>

<ExportDialog bind:open width={640} title={t('proExport.resultsTitle')} testid="pro-data-export-dialog">
  <ExportSection title={t('proExport.format')} summary={formatSummary} open testid="pro-data-export-format">
    <div class="xs-seg">
      <button type="button" class:on={format === 'xlsx'} onclick={() => (format = 'xlsx')} data-testid="pro-data-format-xlsx">Excel</button>
      <button type="button" class:on={format === 'csv'} onclick={() => (format = 'csv')} data-testid="pro-data-format-csv">CSV</button>
    </div>
    <p class="xs-note">{format === 'xlsx' ? t('proExport.formatXlsxNote') : t('proExport.formatCsvNote')}</p>
  </ExportSection>
  <ExportSection title={t('viewExport.sectionContent')} summary={contentSummary} open testid="pro-data-export-content">
    <div class="dx-bar">
      <p class="xs-note">{t('proExport.dataAlways')}</p>
      <span class="dx-all">
        <button type="button" onclick={() => setAll([...modelShown, ...resultsShown], true)}>{t('proExport.all')}</button>
        <button type="button" onclick={() => setAll([...modelShown, ...resultsShown], false)}>{t('proExport.none')}</button>
      </span>
    </div>
    <div class="dx-cols">
      <div class="dx-col">
        <span class="dx-head">{t('proExport.groupModel')}</span>
        {#each MODEL_GROUPS.filter((g) => g.key !== 'design' || uiStore.designInPro) as g (g.key)}
          <CheckGroup title={t(`proExport.grp.${g.key}`)} items={itemsOf(g.sheets, modelShown)} on={on} toggle={flip}
            setAll={(v) => setAll(g.sheets.filter((n) => modelShown.includes(n)), v)} testid="pro-data-sheet" />
        {/each}
      </div>
      <div class="dx-col">
        <span class="dx-head">{t('proExport.groupResults')}</span>
        {#each RESULT_GROUPS as g (g.key)}
          <CheckGroup title={t(`proExport.grp.${g.key}`)} items={itemsOf(g.sheets, resultsShown)} on={on} toggle={flip}
            setAll={(v) => setAll(g.sheets.filter((n) => resultsShown.includes(n)), v)} testid="pro-data-sheet" />
        {/each}
      </div>
    </div>
    {#if wantsResults && !resultsStore.results3D}<p class="xs-note">{t('proExport.dataSolves')}</p>{/if}
    <!-- The design sheets describe the model the design and its detailing were generated from. -->
    {#if open && uiStore.designInPro && DESIGN_SHEETS.some(on)}<OutdatedNotice what="workbook" testid="pro-data-export-outdated" />{/if}
  </ExportSection>

  {#if wantsResults && (cases.length > 1 || combos.length > 0)}
    <ExportSection title={t('proExport.sectionSets')} summary={setsSummary} testid="pro-data-export-sets">
      <div class="dx-cols">
        <CheckGroup title={t('proExport.groupCases')} items={cases.map((c) => ({ id: String(c.id), label: c.name }))}
          on={(id) => !casesOff.has(Number(id))} toggle={(id) => flipId('cases', Number(id))}
          setAll={(v) => (casesOff = v ? new Set() : new Set(cases.map((c) => c.id)))} />
        <CheckGroup title={t('proExport.groupCombos')} items={combos.map((c) => ({ id: String(c.id), label: c.name }))}
          on={(id) => !combosOff.has(Number(id))} toggle={(id) => flipId('combos', Number(id))}
          setAll={(v) => (combosOff = v ? new Set() : new Set(combos.map((c) => c.id)))} />
      </div>
      <p class="xs-note">{t('proExport.setsNote')}</p>
    </ExportSection>
  {/if}

  {#if wantsStations}
    <ExportSection title={t('proExport.sectionStations')} summary={stationsSummary} testid="pro-data-export-stations">
      {#each STATIONS as s (String(s.id))}
        <label class="xs-check"><input type="radio" name="pro-data-stations" checked={stations === s.id} onchange={() => { stations = s.id; save(); }} data-testid={`pro-data-stations-${s.id}`} />{t(s.key)}</label>
      {/each}
      <p class="xs-note">{t('proExport.stationsNote')}</p>
    </ExportSection>
  {/if}


  {#snippet actions()}
    <button type="button" onclick={() => (open = false)}>{t('calcReport.cancel')}</button>
    <button type="button" class="primary" onclick={run} disabled={busy || modelCount + resultCount === 0} data-testid="pro-data-export-download">{t('viewExport.download')}</button>
  {/snippet}
</ExportDialog>

<style>
  .dx-bar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .dx-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; align-items: start; }
  .dx-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  @media (max-width: 560px) { .dx-cols { grid-template-columns: 1fr; } }
  .dx-head { font-size: 0.7rem; color: var(--st-text-3); text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid var(--st-hair); padding-bottom: 2px; }
  .dx-all { flex: none; }
  .xs-seg { justify-self: start; align-self: flex-start; }
  .dx-all { display: inline-flex; gap: 8px; }
  .dx-all button { background: none; border: none; padding: 0; color: var(--st-accent); font: inherit; font-size: 0.74rem; cursor: pointer; }
  .dx-all button:hover { text-decoration: underline; }
</style>
