<script lang="ts">
  /**
   * DXF: what goes in the drawing, from which results, and how it is drawn (`lib/dxf/writer.ts`).
   * Each content goes on its own layer, so what is turned on here can still be hidden in CAD.
   */
  import { t } from '../../../lib/i18n';
  import DrawingFormatRow, { type DrawingFormat } from './DrawingFormatRow.svelte';
  import ExportDialog from '../../export/ExportDialog.svelte';
  import ExportSection from '../../export/ExportSection.svelte';
  import DrawingPresets, { type Preset } from '../../export/DrawingPresets.svelte';
  import DrawingLayout from '../../export/DrawingLayout.svelte';
  import { DXF_CONTENTS, DXF_NEEDS_RESULTS, type DxfContents, type DxfProjection } from '../../../lib/dxf/writer';
  import type { DxfUnit } from '../../../lib/dxf/types';
  import { downloadProDxf, downloadProDxfFiles } from '../../../lib/pro/dxf-export';
  import { ensureProResults, hasShells, resultSetChoices } from '../../../lib/pro/export-results';
  import { uiStore } from '../../../lib/store';
  import { modelIsEmpty, tellIfEmpty } from '../../../lib/export/empty-model';
  import CheckGroup from './CheckGroup.svelte';

  let { open = $bindable(false), onformat }: { open: boolean; onformat?: (f: DrawingFormat) => void } = $props();

  const KEY = 'stabileo-pro-dxf-export';
  interface Prefs { contents: DxfContents; projection: DxfProjection; units: DxfUnit; diagramFactor: number; layers: boolean }
  const BASE: Prefs = {
    layers: true,
    contents: { members: true, nodes: false, supports: true, shells: true, numbering: true, loads: true, deformed: false, moment: false, shear: false, axial: false, reactions: false },
    projection: 'space', units: 'm', diagramFactor: 1,
  };
  function load(): Prefs {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>;
      return { ...BASE, ...p, contents: { ...BASE.contents, ...(p.contents ?? {}) } };
    } catch { return structuredClone(BASE); }
  }
  const prefs = load();
  let contents = $state<DxfContents>(prefs.contents);
  let projection = $state<DxfProjection>(prefs.projection);
  let units = $state<DxfUnit>(prefs.units);
  let diagramFactor = $state(prefs.diagramFactor);
  let layers = $state(prefs.layers);
  let setKey = $state('screen');
  let busy = $state(false);
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ contents: $state.snapshot(contents), projection, units, diagramFactor, layers })); } catch { /* this session only */ }
  }

  const shells = $derived(open && hasShells());
  const offered = $derived(DXF_CONTENTS.filter((k) => k !== 'shells' || shells));
  const MODEL_PART = new Set<keyof DxfContents>(['members', 'nodes', 'supports', 'shells', 'numbering', 'loads']);
  const needsSolve = $derived(offered.some((k) => contents[k] && DXF_NEEDS_RESULTS.has(k)));
  const diagrams = $derived(contents.moment || contents.shear || contents.axial);
  const choices = $derived(open ? resultSetChoices() : []);
  const anything = $derived(offered.some((k) => contents[k]));
  const chosen = $derived(offered.filter((k) => contents[k]));
  const resultsChosen = $derived(chosen.filter((k) => DXF_NEEDS_RESULTS.has(k)).length);
  const MODEL_SET: Array<keyof DxfContents> = ['members', 'supports', 'shells', 'numbering', 'loads'];
  const presets = $derived<Preset[]>([
    { id: 'model', label: t('viewExport.presetModel'), ids: MODEL_SET.filter((k) => offered.includes(k)) },
    { id: 'diagrams', label: t('viewExport.presetDiagrams'), ids: [...MODEL_SET.filter((k) => offered.includes(k)), 'moment', 'shear', 'axial'] },
    { id: 'all', label: t('viewExport.presetAll'), ids: offered },
  ]);
  function preset(ids: readonly string[]) {
    for (const k of DXF_CONTENTS) contents[k] = ids.includes(k);
    save();
  }

  const PROJECTIONS: Array<{ id: DxfProjection; key: string }> = [
    { id: 'space', key: 'proExport.dxf3d' }, { id: 'top', key: 'proExport.viewTop' },
    { id: 'front', key: 'proExport.viewFront' }, { id: 'side', key: 'proExport.viewSide' },
  ];
  const UNITS: DxfUnit[] = ['m', 'cm', 'mm'];
  const groupItems = (model: boolean) => offered.filter((k) => MODEL_PART.has(k) === model).map((k) => ({ id: k, label: t(`proExport.dxf.${k}`) }));
  function setGroup(model: boolean, v: boolean) {
    for (const k of offered) if (MODEL_PART.has(k) === model) contents[k] = v;
    save();
  }

  const contentSummary = $derived(chosen.length
    ? [chosen.map((k) => t(`proExport.dxf.${k}`)).join(', '), resultsChosen ? t(layers ? 'proExport.dxfLayoutLayers' : 'proExport.dxfLayoutSeparate') : null].filter(Boolean).join(' · ')
    : t('viewExport.nothing'));
  const resultsSummary = $derived(choices.find((c) => c.key === setKey)?.label ?? '—');
  const drawingSummary = $derived(`${t(PROJECTIONS.find((p) => p.id === projection)!.key)} · ${units}`);

  async function run() {
    if (busy || !anything) return;
    busy = true;
    try {
      let c = $state.snapshot(contents) as DxfContents;
      if (needsSolve && !(await ensureProResults())) {
        // Without results, the drawing is the model: what needed them is left out, and said.
        c = { ...c, deformed: false, moment: false, shear: false, axial: false, reactions: false };
        if (!modelIsEmpty()) uiStore.toast(t('proExport.dxfNoResults'), 'info');
      }
      tellIfEmpty();
      const req = { contents: c, projection, units, set: setKey, diagramFactor };
      await (layers ? downloadProDxf(req) : downloadProDxfFiles(req));
      open = false;
    } finally {
      busy = false;
    }
  }
</script>

<ExportDialog bind:open width={560} title={`${t('proExport.drawingsTitle')} — DXF`} testid="pro-dxf-export-dialog">
  <DrawingFormatRow current="dxf" onpick={(f) => { if (f !== 'dxf') onformat?.(f); }} />
  <ExportSection title={t('viewExport.sectionContent')} summary={contentSummary} open testid="pro-dxf-export-content">
    <DrawingPresets {presets} {chosen} onpick={preset} testid="pro-dxf" />
    <div class="dx-cols">
      <CheckGroup title={t('proExport.groupModel')} items={groupItems(true)} on={(id) => contents[id as keyof DxfContents]}
        toggle={(id) => { const k = id as keyof DxfContents; contents[k] = !contents[k]; save(); }} setAll={(v) => setGroup(true, v)} testid="pro-dxf" />
      <CheckGroup title={t('proExport.groupResults')} items={groupItems(false)} on={(id) => contents[id as keyof DxfContents]}
        toggle={(id) => { const k = id as keyof DxfContents; contents[k] = !contents[k]; save(); }} setAll={(v) => setGroup(false, v)} testid="pro-dxf" />
    </div>
    {#if resultsChosen}
      <DrawingLayout together={layers} labels={[t('proExport.dxfLayoutLayers'), t('proExport.dxfLayoutSeparate')]}
        notes={[t('proExport.dxfLayoutLayersNote'), t('proExport.dxfLayoutSeparateNote')]}
        onpick={(v) => { layers = v; save(); }} testid="pro-dxf-layout" />
    {:else}
      <p class="xs-note">{t('proExport.dxfLayersNote')}</p>
    {/if}
  </ExportSection>

  {#if needsSolve && choices.length > 1}
    <ExportSection title={t('proExport.sectionResults')} summary={resultsSummary} testid="pro-dxf-export-results">
      <label class="xs-field">
        <span>{t('proExport.resultsOf')}</span>
        <select bind:value={setKey} data-testid="pro-dxf-set">
          {#each choices as c (c.key)}<option value={c.key}>{c.label}</option>{/each}
        </select>
      </label>
    </ExportSection>
  {/if}

  <ExportSection title={t('viewExport.sectionDrawing')} summary={drawingSummary}>
    <label class="xs-field">
      <span>{t('proExport.dxfProjection')}</span>
      <select value={projection} onchange={(e) => { projection = e.currentTarget.value as DxfProjection; save(); }} data-testid="pro-dxf-projection">
        {#each PROJECTIONS as p (p.id)}<option value={p.id}>{t(p.key)}</option>{/each}
      </select>
    </label>
    <div class="xs-field">
      <span>{t('proExport.dxfUnits')}</span>
      <div class="xs-seg">
        {#each UNITS as u (u)}
          <button type="button" class:on={units === u} onclick={() => { units = u; save(); }} data-testid={`pro-dxf-units-${u}`}>{u}</button>
        {/each}
      </div>
    </div>
    {#if diagrams}
      <label class="xs-field">
        <span>{t('proExport.dxfDiagramSize')}</span>
        <select bind:value={diagramFactor} onchange={save}>
          <option value={0.5}>{t('proExport.sizeSmall')}</option>
          <option value={1}>{t('proExport.sizeNormal')}</option>
          <option value={2}>{t('proExport.sizeLarge')}</option>
        </select>
      </label>
    {/if}
    <p class="xs-note">{projection === 'space' ? t('proExport.dxf3dNote') : t('proExport.dxfProjectedNote')}</p>
  </ExportSection>

  {#snippet actions()}
    <button type="button" onclick={() => (open = false)}>{t('calcReport.cancel')}</button>
    <button type="button" class="primary" onclick={run} disabled={busy || !anything} data-testid="pro-dxf-export-download">{t('viewExport.download')}</button>
  {/snippet}
</ExportDialog>

<style>
  .dx-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; align-items: start; }
  @media (max-width: 520px) { .dx-cols { grid-template-columns: 1fr; } }
  .xs-seg { justify-self: start; align-self: flex-start; }
</style>
