<script lang="ts">
  // CAD → RC draft wizard (PR [9]).
  //
  // 4 steps: (1) upload/units → (2) layer roles → (3) assumptions →
  // (4) draft preview + Apply/Back/Cancel.
  //
  // The model store is NOT touched until the user clicks Apply. Apply is one
  // transactional pushState + restore(draft.snapshot); Cancel at any step
  // simply closes. The generated model carries a 'cad-draft-unreviewed'
  // provenance tag with the full assumption list (including the v1
  // one-plan-replicated-to-all-floors assumption).
  import { modelStore, uiStore, resultsStore, historyStore } from '../lib/store';
  import { t } from '../lib/i18n';
  import { parseCadDxf, unsupportedFileKind, suggestUnitFromExtent } from '../lib/cad/parse';
  import { suggestLayerMappings, extractArchPlan } from '../lib/cad/classify';
  import { drawCadPreview, ROLE_COLORS } from '../lib/cad/preview';
  import { drawDraftPreview } from '../lib/cad/draft-preview';
  import { diagnoseDraft, type DraftDiagnostics } from '../lib/cad/diagnostics';
  import { buildDraft, validateFloorRanges, type InferenceOptions, type FloorPlanSpec } from '../lib/cad/draft-build';
  import { cropDoc, densestPlanWindow, type PlanWindow } from '../lib/cad/infer';
  import { buildStabileoTemplateDxf } from '../lib/cad/template';
  import { parseScheduleRow } from '../lib/cad/specs';
  import {
    LAYER_ROLES, CONCRETE_GRADES,
    type CadDocument, type CadUnit, type LayerMapping, type LayerRole,
    type ConcreteGrade, type RcDraftAssumptions, type RcDraftResult,
    type SectionScheduleEntry,
  } from '../lib/cad/types';

  let { open = false, file = null as File | null, onclose = (() => {}) as () => void } = $props();

  let step = $state(1);
  let doc = $state<CadDocument | null>(null);
  let error = $state<string | null>(null);
  let fileName = $state('');
  let unit = $state<CadUnit>('m');
  let mappings = $state<LayerMapping[]>([]);
  let draft = $state<RcDraftResult | null>(null);
  // Generation failure shown as an in-wizard panel (distinct from `error`,
  // which is file-level and hides the whole body). Keeps the user on step 3.
  let genError = $state<{ message: string; detail?: string } | null>(null);
  let canvas = $state<HTMLCanvasElement | null>(null);

  // ── Assumptions form state ─────────────────────────────────
  let nFloors = $state(1);
  let storyHeight = $state(3);
  let storyHeightsCsv = $state('');
  let concreteGrade = $state<ConcreteGrade>('H-30');
  let colB = $state(0.3);
  let colH = $state(0.3);
  let beamB = $state(0.2);
  let beamH = $state(0.5);
  let slabThickness = $state(0.15);
  let wallThickness = $state(0.15);
  let baseSupport = $state<'fixed3d' | 'pinned3d'>('fixed3d');
  let deadLoad = $state(2);
  let liveLoad = $state(2);
  let useRoofLr = $state(true);
  let roofLiveLoad = $state(1);
  let detectOffsets = $state(true);
  let offsetTolerance = $state(0.03);
  // Wizard schedule editor rows ("40x60" for b×h, "20" for thickness).
  let scheduleRows = $state<Array<{ kind: SectionScheduleEntry['kind']; mark: string; floors: string; dims: string }>>([]);
  let levelsPrefilled = $state(false);
  let roomBasedLiveLoads = $state(false);
  let generateCombos = $state(true);
  let meshSlabs = $state(true);
  let meshMode = $state<'targetSize' | 'fixedDivisions'>('targetSize');
  let meshTargetSize = $state(1.0);
  let meshDivisions = $state(4);
  let splitBeams = $state(true);
  let snapTolerance = $state(0.01);

  // ── PR [14] crop / inference / multi-floor / diagnostics ───
  let cropEnabled = $state(false);
  let cropWin = $state<PlanWindow>({ x0: 0, x1: 0, y0: 0, y1: 0 });
  let infPruneBeams = $state(false);
  let infInferSlabs = $state(false);
  let infSnapColumns = $state(true);
  let infPruneFloating = $state(false);
  // Per-floor plan regions (crop windows of the same file → floor ranges).
  let floorRegions = $state<Array<PlanWindow & { fromFloor: number; toFloor: number; label: string }>>([]);
  // Set once the user has acknowledged an uncovered-floor gap so the next build
  // proceeds (gaps become warnings instead of a blocking error).
  let allowFloorGaps = $state(false);
  let diagnostics = $state<DraftDiagnostics | null>(null);
  let previewCanvas = $state<HTMLCanvasElement | null>(null);

  let fileInput = $state<HTMLInputElement | null>(null);

  /** Parse a DXF file into the wizard state (shared by the prop path and the
   *  in-wizard "Open DXF file" button). */
  function loadFile(f: File): void {
    fileName = f.name;
    levelsPrefilled = false;
    const kind = unsupportedFileKind(f.name);
    if (kind) {
      doc = null;
      error = t(`cad.unsupported.${kind}`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const parsed = parseCadDxf(text, f.name);
        if (parsed.warnings.includes('parseError') || parsed.entities.length === 0) {
          doc = parsed;
          error = parsed.warnings.includes('parseError') ? t('cad.parseError') : t('cad.emptyFile');
          return;
        }
        error = null;
        doc = parsed;
        unit = parsed.suggestedUnit ?? 'm';
        mappings = suggestLayerMappings(parsed, unit);
        if (parsed.bbox) cropWin = { x0: parsed.bbox.minX, x1: parsed.bbox.maxX, y0: parsed.bbox.minY, y1: parsed.bbox.maxY };
        step = 1;
        draft = null;
      } catch {
        error = t('cad.parseError');
      }
    };
    reader.onerror = () => { error = t('cad.readError'); };
    reader.readAsText(f);
  }

  function reset(): void {
    doc = null; error = null; genError = null; fileName = ''; step = 1; draft = null;
    mappings = []; levelsPrefilled = false; scheduleRows = [];
    cropEnabled = false; cropWin = { x0: 0, x1: 0, y0: 0, y1: 0 };
    infPruneBeams = false; infInferSlabs = false; infSnapColumns = true; infPruneFloating = false;
    floorRegions = []; diagnostics = null;
  }

  // The `file` prop is set only by drag-drop / direct-import routes. The
  // normal toolbar/PRO button opens the wizard with file=null (empty step 1).
  // Reset on each open edge, then load the prop file if one was passed.
  let wasOpen = false;
  let lastPropFile: File | null = null;
  $effect(() => {
    if (open && !wasOpen) {
      wasOpen = true;
      reset();
      lastPropFile = file;
      if (file) loadFile(file);
    } else if (!open && wasOpen) {
      wasOpen = false;
    } else if (open && file && file !== lastPropFile) {
      lastPropFile = file;
      loadFile(file);
    }
  });

  function openFilePicker(): void { fileInput?.click(); }

  function onFileChosen(e: Event): void {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (f) loadFile(f);
    (e.currentTarget as HTMLInputElement).value = '';
  }

  const roleOf = (layer: string): LayerRole =>
    mappings.find((m) => m.layer === layer)?.role ?? 'ignore';

  /** Document actually fed to extraction — cropped to the plan window when the
   *  user enabled cropping (PR [14] Layer 2). */
  const effectiveDoc = $derived.by(() => {
    if (!doc) return null;
    return cropEnabled ? cropDoc(doc, cropWin) : doc;
  });

  const plan = $derived.by(() => {
    const d = effectiveDoc;
    if (!d || error) return null;
    return extractArchPlan(d, mappings, unit);
  });

  /** Unit-extent sanity warning (mm header on a metre drawing, etc.). */
  const unitWarning = $derived.by(() => (doc?.bbox ? suggestUnitFromExtent(doc.bbox, unit) : null));

  /** Active inference options (Layer 2). */
  const inferenceOpts = $derived<InferenceOptions>({
    pruneDisconnectedBeams: infPruneBeams,
    inferSlabPanels: infInferSlabs,
    snapPanelsToColumns: infSnapColumns,
    pruneFloatingMembers: infPruneFloating,
  });
  const anyInference = $derived(infPruneBeams || infInferSlabs || infPruneFloating);

  /** Per-layer contribution counts from the extracted plan (Layer 1). */
  const layerContrib = $derived.by(() => {
    const m = new Map<string, { columns: number; beams: number; walls: number; slabs: number }>();
    const bump = (layer: string | undefined, k: 'columns' | 'beams' | 'walls' | 'slabs') => {
      if (!layer) return;
      const e = m.get(layer) ?? { columns: 0, beams: 0, walls: 0, slabs: 0 };
      e[k]++; m.set(layer, e);
    };
    if (plan) {
      for (const c of plan.columns) bump(c.srcLayer, 'columns');
      for (const b of plan.beams) bump(b.srcLayer, 'beams');
      for (const w of plan.walls) bump(w.srcLayer, 'walls');
      for (const s of plan.slabs) bump(s.srcLayer, 'slabs');
    }
    return m;
  });

  function applySuggestedUnit(): void {
    if (unitWarning) { unit = unitWarning.suggested; reSuggest(); }
  }

  function autoDetectCrop(): void {
    if (!doc) return;
    const w = densestPlanWindow(doc);
    if (w) { cropWin = w; cropEnabled = true; }
  }

  function fullExtentCrop(): void {
    if (doc?.bbox) cropWin = { x0: doc.bbox.minX, x1: doc.bbox.maxX, y0: doc.bbox.minY, y1: doc.bbox.maxY };
  }

  function addFloorRegion(): void {
    const f = floorRegions.length + 1;
    floorRegions = [...floorRegions, { ...cropWin, fromFloor: f, toFloor: f, label: `Plan ${String.fromCharCode(64 + f)}` }];
  }

  // Redraw the preview whenever the document, mapping, or step changes.
  $effect(() => {
    if (canvas && doc && (step === 1 || step === 2)) {
      void mappings; // reactive dep: redraw on role change
      drawCadPreview(canvas, doc, roleOf);
    }
  });

  // Step-4 generated-model preview: draw the actual snapshot that will be
  // applied, highlighting orphan/floating nodes (PR [14] Layer 1).
  $effect(() => {
    if (previewCanvas && draft && step === 4) {
      drawDraftPreview(previewCanvas, draft.snapshot, { highlightFailures: true });
    }
  });

  // Any edit to the floor ranges (add/remove/renumber) invalidates a prior
  // gap acknowledgement, so the user must re-confirm a newly-introduced gap.
  $effect(() => {
    void floorRegions.map((r) => `${r.fromFloor}-${r.toFloor}`).join(',');
    void nFloors;
    allowFloorGaps = false;
  });

  function setRole(layer: string, role: LayerRole): void {
    mappings = mappings.map((m) => (m.layer === layer ? { ...m, role } : m));
  }

  function reSuggest(): void {
    if (doc) mappings = suggestLayerMappings(doc, unit);
  }

  function assumptions(): RcDraftAssumptions {
    const heights = storyHeightsCsv.trim()
      ? storyHeightsCsv.split(',').map((s) => parseFloat(s.trim())).filter((v) => v > 0)
      : [];
    const storyHeights = heights.length === nFloors
      ? heights
      : Array.from({ length: nFloors }, () => storyHeight);
    return {
      nFloors, storyHeights, concreteGrade,
      columnSection: { b: colB, h: colH },
      beamSection: { b: beamB, h: beamH },
      slabThickness, wallThickness, baseSupport,
      deadLoad, liveLoad, generateCombos,
      roofLiveLoad: useRoofLr ? roofLiveLoad : undefined,
      roomBasedLiveLoads,
      meshSlabs, meshMode, meshTargetSize, meshDivisions, splitBeams, snapTolerance,
      detectOffsets,
      offsetTolerance,
      schedules: wizardSchedules(),
    };
  }

  /** Parse the editor rows through the same parser used for CAD schedules. */
  function wizardSchedules(): SectionScheduleEntry[] {
    const out: SectionScheduleEntry[] = [];
    for (const r of scheduleRows) {
      const row = parseScheduleRow(`${r.mark.trim() || '*'} ${r.floors.trim()} ${r.dims.trim()}`, r.kind);
      if (row) out.push({ ...row, source: 'wizard' });
    }
    return out;
  }

  function downloadTemplate(): void {
    const blob = new Blob([buildStabileoTemplateDxf()], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const aEl = document.createElement('a');
    aEl.href = url;
    aEl.download = 'stabileo-template.dxf';
    aEl.click();
    URL.revokeObjectURL(url);
  }

  /** Pre-fill floors/heights once from an STB_LEVEL_SCHEDULE, if present. */
  function prefillFromPlan(): void {
    if (levelsPrefilled || !plan?.levelHeights?.length) return;
    nFloors = plan.levelHeights.length;
    storyHeight = plan.levelHeights[plan.levelHeights.length - 1];
    storyHeightsCsv = plan.levelHeights.join(', ');
    levelsPrefilled = true;
  }

  const assumptionsValid = $derived(
    nFloors >= 1 && storyHeight > 0 && colB > 0 && colH > 0 && beamB > 0 && beamH > 0 &&
    slabThickness > 0 && wallThickness > 0 && deadLoad >= 0 && liveLoad >= 0 &&
    meshDivisions >= 1 && snapTolerance > 0 &&
    // When meshing slabs by target size, the size must be a positive number —
    // a cleared/zeroed field would otherwise drive an unbounded mesh loop.
    (!meshSlabs || meshMode !== 'targetSize' || (meshTargetSize > 0 && Number.isFinite(meshTargetSize))),
  );

  const classifiedCount = $derived(
    mappings.filter((m) => m.role !== 'ignore' && m.role !== 'text' && m.role !== 'grid').length,
  );

  function goPreview(): void {
    if (!plan) return;
    if (plan.columns.length === 0 && plan.beams.length === 0 &&
        plan.walls.length === 0 && plan.slabs.length === 0) {
      error = t('cad.nothingClassified');
      return;
    }
    error = null;
    genError = null;
    // The model store is never touched here (only handleApply mutates it), so a
    // failure can't leave a partial model. Containment keeps the Svelte app from
    // crashing on malformed/ambiguous CAD data: any throw becomes an in-wizard
    // panel and the user stays on step 3 to adjust mappings/assumptions.
    let result: RcDraftResult;
    const source = { fileName, importedAtIso: new Date().toISOString() };
    const inference = anyInference ? inferenceOpts : undefined;
    try {
      if (floorRegions.length > 0 && doc) {
        // Per-floor plans: each region is a crop window of the same file,
        // read through the same layer mapping (PR [14] Layer 3).
        const floorPlans: FloorPlanSpec[] = floorRegions.map((r) => ({
          plan: extractArchPlan(cropDoc(doc!, r), mappings, unit),
          fromFloor: r.fromFloor, toFloor: r.toFloor, label: r.label,
        }));
        // Validate ranges up front so overlaps/out-of-range are a clear, blocking
        // error and an uncovered-floor gap prompts an explicit confirmation
        // before we silently build fewer floors than intended.
        const issues = validateFloorRanges(floorPlans, nFloors, allowFloorGaps);
        const hardErrors = issues.filter((i) => i.severity === 'error');
        if (hardErrors.length > 0) {
          const gapOnly = hardErrors.every((i) => i.message.startsWith('floorRangeGap:'));
          genError = {
            message: gapOnly ? t('cad.floorGapConfirm') : t('cad.floorRangeError'),
            detail: hardErrors.map((i) => i.message).join('\n'),
          };
          if (gapOnly) allowFloorGaps = true; // next "Generate" click proceeds with gaps as warnings
          return; // stay on step 3, model untouched
        }
        result = buildDraft({ floorPlans, assumptions: assumptions(), source, inference, allowFloorGaps });
      } else {
        result = buildDraft({ plan, assumptions: assumptions(), source, inference });
      }
    } catch (e) {
      const showDetail = import.meta.env.DEV || import.meta.env.MODE === 'test';
      genError = {
        message: t('cad.generateFailed'),
        detail: showDetail ? (e instanceof Error ? (e.stack ?? e.message) : String(e)) : undefined,
      };
      return; // stay on step 3, model untouched, draft unchanged
    }
    draft = result;
    diagnostics = diagnoseDraft(result);
    step = 4;
  }

  function handleApply(): void {
    if (!draft) return;
    historyStore.pushState();
    modelStore.restore(draft.snapshot);
    resultsStore.clear();
    uiStore.toast(
      t('cad.applied')
        .replace('{nodes}', String(draft.counts.nodes))
        .replace('{elems}', String(draft.counts.columns + draft.counts.beams))
        .replace('{shells}', String(draft.counts.slabQuads + draft.counts.wallQuads)),
      'success',
    );
    onclose();
  }

  /** Machine warning code → localized message. */
  function warnText(code: string): string {
    const [head, ...rest] = code.split(':');
    const base = t(`cad.warn.${head}`);
    if (base === `cad.warn.${head}`) return code; // unknown code: show raw
    return base.replace('{n}', rest[rest.length - 1] ?? '').replace('{type}', rest[0] ?? '');
  }

  const skippedGroups = $derived.by(() => {
    if (!plan) return [];
    const map = new Map<string, number>();
    for (const s of plan.skipped) {
      const key = `${s.reason}|${s.layer}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].map(([key, count]) => {
      const [reason, layer] = key.split('|');
      return { reason, layer, count };
    });
  });

  const stepLabels = ['cad.step1', 'cad.step2', 'cad.step3', 'cad.step4'];
</script>

{#if open}
  <div class="overlay" role="presentation">
    <div class="dialog" role="dialog" aria-label={t('cad.title')}>
      <div class="header">
        <h2>{t('cad.title')}</h2>
        <span class="file-name">{fileName}</span>
        <button class="close-btn" onclick={onclose} title={t('cad.cancel')}>✕</button>
      </div>

      <div class="steps">
        {#each stepLabels as label, i}
          <span class="step-chip" class:active={step === i + 1} class:done={step > i + 1}>
            {i + 1}. {t(label)}
          </span>
        {/each}
      </div>

      <div class="body">
        {#if step === 1}
          <input
            bind:this={fileInput}
            type="file"
            accept=".dxf"
            style="display:none"
            onchange={onFileChosen}
          />
          <div class="open-actions">
            <button class="btn" onclick={downloadTemplate}>⬇ {t('cad.downloadTemplate')}</button>
            <button class="btn primary" onclick={openFilePicker}>📂 {t('cad.openFile')}</button>
          </div>
          <div class="row hint">{t('cad.downloadTemplateHint')}</div>
          {#if !doc && !error}
            <div class="row hint open-prompt">{t('cad.openPrompt')}</div>
          {/if}
        {/if}
        {#if error}
          <div class="error">{error}</div>
        {/if}

        {#if doc && !error}
          {#if step === 1 || step === 2}
            <div class="split">
              <div class="left">
                {#if step === 1}
                  <h3>{t('cad.unitsTitle')}</h3>
                  <div class="row">
                    <label for="cad-unit">{t('cad.units')}</label>
                    <select id="cad-unit" bind:value={unit} onchange={reSuggest}>
                      <option value="m">{t('cad.meters')}</option>
                      <option value="cm">{t('cad.centimeters')}</option>
                      <option value="mm">{t('cad.millimeters')}</option>
                    </select>
                    {#if doc.suggestedUnit}
                      <span class="hint">{t('cad.unitSuggested').replace('{u}', doc.suggestedUnit)}</span>
                    {:else}
                      <span class="hint">{t('cad.unitUnknown')}</span>
                    {/if}
                  </div>
                  {#if unitWarning}
                    <div class="unit-warn" role="alert">
                      ⚠ {t('cad.unitSanity')
                        .replace('{cur}', unit)
                        .replace('{curM}', unitWarning.currentExtentM.toFixed(2))
                        .replace('{sug}', unitWarning.suggested)
                        .replace('{sugM}', unitWarning.suggestedExtentM.toFixed(2))}
                      <button class="btn mini" onclick={applySuggestedUnit}>
                        {t('cad.unitUseSuggested').replace('{u}', unitWarning.suggested)}
                      </button>
                    </div>
                  {/if}
                  {#if doc.bbox}
                    {@const k = unit === 'm' ? 1 : unit === 'cm' ? 0.01 : 0.001}
                    <div class="row hint">
                      {t('cad.extents')
                        .replace('{w}', ((doc.bbox.maxX - doc.bbox.minX) * k).toFixed(2))
                        .replace('{h}', ((doc.bbox.maxY - doc.bbox.minY) * k).toFixed(2))}
                    </div>
                  {/if}
                  <details class="panel crop-panel">
                    <summary>{t('cad.cropTitle')}</summary>
                    <div class="hint">{t('cad.cropHint')}</div>
                    <label class="check">
                      <input type="checkbox" bind:checked={cropEnabled} />
                      {t('cad.cropEnable')}
                    </label>
                    <div class="crop-grid" class:disabled={!cropEnabled}>
                      <label>x₀<input type="number" step="0.1" bind:value={cropWin.x0} disabled={!cropEnabled} /></label>
                      <label>x₁<input type="number" step="0.1" bind:value={cropWin.x1} disabled={!cropEnabled} /></label>
                      <label>y₀<input type="number" step="0.1" bind:value={cropWin.y0} disabled={!cropEnabled} /></label>
                      <label>y₁<input type="number" step="0.1" bind:value={cropWin.y1} disabled={!cropEnabled} /></label>
                    </div>
                    <div class="crop-actions">
                      <button class="btn mini" onclick={autoDetectCrop}>{t('cad.cropAuto')}</button>
                      <button class="btn mini" onclick={fullExtentCrop} disabled={!cropEnabled}>{t('cad.cropFull')}</button>
                    </div>
                  </details>
                  <h3>{t('cad.contents')}</h3>
                  <div class="row hint">
                    {doc.entities.length} {t('cad.entities')} · {doc.layers.length} {t('cad.layersN')}
                  </div>
                  {#each Object.entries(doc.unsupported) as [type, count]}
                    <div class="warn-line">⚠ {t('cad.warn.unsupportedEntity').replace('{type}', type).replace('{n}', String(count))}</div>
                  {/each}
                {:else}
                  <h3>{t('cad.layerRoles')}</h3>
                  <div class="hint">{t('cad.layerRolesHint')}</div>
                  <table class="layer-table">
                    <thead>
                      <tr><th>{t('cad.layer')}</th><th>#</th><th>{t('cad.suggested')}</th><th>{t('cad.role')}</th><th>{t('cad.generates')}</th></tr>
                    </thead>
                    <tbody>
                      {#each mappings as m (m.layer)}
                        {@const lc = doc.layers.find((l) => l.name === m.layer)}
                        {@const total = lc?.total ?? 0}
                        {@const breakdown = Object.entries(lc?.entityCounts ?? {}).map(([kind, n]) => `${n} ${kind}`).join(', ')}
                        {@const contrib = layerContrib.get(m.layer)}
                        <tr>
                          <td class="layer-name">
                            <span class="role-dot" style="background:{ROLE_COLORS[m.role]}"></span>
                            {m.layer}
                            {#if breakdown}<div class="layer-breakdown">{breakdown}</div>{/if}
                          </td>
                          <td class="num">{total}</td>
                          <td class="suggested" title={m.evidence}>
                            {t(`cad.role.${m.suggested}`)}
                            <span class="conf conf-{m.confidence}">{t(`cad.conf.${m.confidence}`)}</span>
                          </td>
                          <td>
                            <select value={m.role} onchange={(e) => setRole(m.layer, (e.currentTarget as HTMLSelectElement).value as LayerRole)}>
                              {#each LAYER_ROLES as r}
                                <option value={r}>{t(`cad.role.${r}`)}</option>
                              {/each}
                            </select>
                          </td>
                          <td class="contrib">
                            {#if contrib}
                              {#if contrib.columns}<span title={t('cad.role.column')}>🟥{contrib.columns}</span>{/if}
                              {#if contrib.beams}<span title={t('cad.role.beam')}>🟦{contrib.beams}</span>{/if}
                              {#if contrib.walls}<span title={t('cad.role.wall')}>🟧{contrib.walls}</span>{/if}
                              {#if contrib.slabs}<span title={t('cad.role.slab')}>🔷{contrib.slabs}</span>{/if}
                            {:else if m.role !== 'ignore' && m.role !== 'text' && m.role !== 'grid'}
                              <span class="contrib-zero" title={t('cad.generatesNothing')}>0</span>
                            {/if}
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                  {#if plan}
                    <div class="row hint">
                      {t('cad.classified')
                        .replace('{cols}', String(plan.columns.length))
                        .replace('{beams}', String(plan.beams.length))
                        .replace('{walls}', String(plan.walls.length))
                        .replace('{slabs}', String(plan.slabs.length))}
                    </div>
                  {/if}
                  <details class="role-guide">
                    <summary>{t('cad.roleGuide')}</summary>
                    <dl>
                      {#each (['column', 'beam', 'wall', 'slab', 'opening', 'grid', 'text', 'ignore'] as LayerRole[]) as r}
                        <div class="role-guide-row">
                          <dt><span class="role-dot" style="background:{ROLE_COLORS[r]}"></span>{t(`cad.role.${r}`)}</dt>
                          <dd>{t(`cad.roleGuide.${r}`)}</dd>
                        </div>
                      {/each}
                    </dl>
                  </details>
                {/if}
              </div>
              <div class="right">
                <canvas bind:this={canvas} width="380" height="320"></canvas>
                <div class="legend">
                  {#each (['column', 'beam', 'wall', 'slab', 'opening', 'grid'] as LayerRole[]) as r}
                    <span><span class="role-dot" style="background:{ROLE_COLORS[r]}"></span>{t(`cad.role.${r}`)}</span>
                  {/each}
                </div>
              </div>
            </div>
          {:else if step === 3}
            {#if genError}
              <div class="gen-error" role="alert">
                <strong>⚠ {genError.message}</strong>
                <div class="gen-error-note">{t('cad.modelNotModified')}</div>
                {#if genError.detail}
                  <pre class="gen-error-detail">{genError.detail}</pre>
                {/if}
              </div>
            {/if}
            <div class="banner">{t('cad.replicatedBanner')}</div>
            <div class="form-grid">
              <details class="panel" open>
                <summary>{t('cad.geometry')}</summary>
                <label>{t('cad.nFloors')}
                  <input type="number" min="1" max="50" step="1" bind:value={nFloors} />
                </label>
                <label>{t('cad.storyHeight')}
                  <input type="number" min="0.1" step="0.1" bind:value={storyHeight} />
                </label>
                <label>{t('cad.storyHeightsCsv')}
                  <input type="text" placeholder="3, 3, 2.8" bind:value={storyHeightsCsv} />
                </label>
              </details>
              <details class="panel" open>
                <summary>{t('cad.materialSections')}</summary>
                <label>{t('cad.concreteGrade')}
                  <select bind:value={concreteGrade}>
                    {#each Object.keys(CONCRETE_GRADES) as g}
                      <option value={g}>{g}</option>
                    {/each}
                  </select>
                </label>
                <label>{t('cad.colSection')}
                  <span class="pair">
                    <input type="number" min="0.05" step="0.05" bind:value={colB} />
                    ×
                    <input type="number" min="0.05" step="0.05" bind:value={colH} />
                  </span>
                </label>
                <label>{t('cad.beamSection')}
                  <span class="pair">
                    <input type="number" min="0.05" step="0.05" bind:value={beamB} />
                    ×
                    <input type="number" min="0.05" step="0.05" bind:value={beamH} />
                  </span>
                </label>
                <label>{t('cad.slabThickness')}
                  <input type="number" min="0.05" step="0.01" bind:value={slabThickness} />
                </label>
                <label>{t('cad.wallThickness')}
                  <input type="number" min="0.05" step="0.01" bind:value={wallThickness} />
                </label>
              </details>
              <details class="panel" open>
                <summary>{t('cad.supportsLoads')}</summary>
                <label>{t('cad.baseSupport')}
                  <select bind:value={baseSupport}>
                    <option value="fixed3d">{t('cad.fixed')}</option>
                    <option value="pinned3d">{t('cad.pinned')}</option>
                  </select>
                </label>
                <label>{t('cad.deadLoad')}
                  <input type="number" min="0" step="0.5" bind:value={deadLoad} />
                </label>
                <label>{t('cad.liveLoad')}
                  <input type="number" min="0" step="0.5" bind:value={liveLoad} />
                </label>
                <label class="check">
                  <input type="checkbox" bind:checked={useRoofLr} />
                  {t('cad.useRoofLr')}
                </label>
                <label>{t('cad.roofLiveLoad')}
                  <input type="number" min="0" step="0.5" bind:value={roofLiveLoad} disabled={!useRoofLr} />
                </label>
                <div class="hint">{t('cad.loadsHint')}</div>
                <label class="check">
                  <input type="checkbox" bind:checked={roomBasedLiveLoads} disabled={(plan?.roomLabels.length ?? 0) === 0} />
                  {t('cad.roomBasedLive')}
                </label>
                {#if plan && plan.roomLabels.length > 0}
                  <div class="hint">{t('cad.roomLabelsFound').replace('{n}', String(plan.roomLabels.length))}</div>
                  {#if roomBasedLiveLoads}
                    <div class="room-map">
                      {#each [...new Map(plan.roomLabels.map((r) => [r.category, r.q]))] as [cat, q]}
                        <span>{t(`cad.roomCat.${cat}`)} → {q} kN/m²</span>
                      {/each}
                    </div>
                  {/if}
                {:else}
                  <div class="hint">{t('cad.roomNoLabels')}</div>
                {/if}
                <label class="check">
                  <input type="checkbox" bind:checked={generateCombos} />
                  {t('cad.generateCombos')}
                </label>
              </details>
              <details class="panel" open>
                <summary>{t('cad.meshing')}</summary>
                <label class="check">
                  <input type="checkbox" bind:checked={meshSlabs} />
                  {t('cad.meshSlabs')}
                </label>
                <label>{t('cad.meshMode')}
                  <select bind:value={meshMode} disabled={!meshSlabs}>
                    <option value="targetSize">{t('cad.meshModeTarget')}</option>
                    <option value="fixedDivisions">{t('cad.meshModeFixed')}</option>
                  </select>
                </label>
                {#if meshMode === 'targetSize'}
                  <label>{t('cad.meshTargetSize')}
                    <input type="number" min="0.25" max="5" step="0.25" bind:value={meshTargetSize} disabled={!meshSlabs} />
                  </label>
                  <div class="hint">{t('cad.meshTargetHint')}</div>
                {:else}
                  <label>{t('cad.meshDivisions')}
                    <input type="number" min="1" max="12" step="1" bind:value={meshDivisions} disabled={!meshSlabs} />
                  </label>
                {/if}
                <label class="check">
                  <input type="checkbox" bind:checked={splitBeams} />
                  {t('cad.splitBeams')}
                </label>
                <label>{t('cad.snapTolerance')}
                  <input type="number" min="0.001" max="0.1" step="0.001" bind:value={snapTolerance} />
                </label>
              </details>
              <details class="panel">
                <summary>{t('cad.schedulesPanel')}</summary>
                <div class="hint">{t('cad.schedulesHint')}</div>
                {#if plan && plan.schedules.length > 0}
                  <div class="hint">{t('cad.schedulesFromCad').replace('{n}', String(plan.schedules.length))}</div>
                {/if}
                {#each scheduleRows as row, i}
                  <div class="sched-row">
                    <select bind:value={row.kind}>
                      <option value="column">{t('cad.role.column')}</option>
                      <option value="beam">{t('cad.role.beam')}</option>
                      <option value="wall">{t('cad.role.wall')}</option>
                      <option value="slab">{t('cad.role.slab')}</option>
                    </select>
                    <input type="text" placeholder="C1 | *" bind:value={row.mark} title={t('cad.schedMark')} />
                    <input type="text" placeholder="1-3" bind:value={row.floors} title={t('cad.schedFloors')} />
                    <input type="text" placeholder="40x60 | 20" bind:value={row.dims} title={t('cad.schedDims')} />
                    <button class="btn mini" onclick={() => { scheduleRows = scheduleRows.filter((_, j) => j !== i); }}>✕</button>
                  </div>
                {/each}
                <button class="btn mini" onclick={() => { scheduleRows = [...scheduleRows, { kind: 'column', mark: '*', floors: '1-' + String(nFloors), dims: '' }]; }}>
                  + {t('cad.schedRowAdd')}
                </button>
              </details>
              <details class="panel">
                <summary>{t('cad.offsetsPanel')}</summary>
                <label class="check">
                  <input type="checkbox" bind:checked={detectOffsets} />
                  {t('cad.detectOffsets')}
                </label>
                <label>{t('cad.offsetTol')}
                  <input type="number" min="0.01" max="0.2" step="0.01" bind:value={offsetTolerance} disabled={!detectOffsets} />
                </label>
                <div class="hint">{t('cad.offsetsHint')}</div>
              </details>
              <details class="panel infer-panel">
                <summary>{t('cad.inferPanel')}</summary>
                <div class="hint warn-text">{t('cad.inferHint')}</div>
                <label class="check">
                  <input type="checkbox" bind:checked={infPruneBeams} />
                  {t('cad.inferPruneBeams')}
                </label>
                <label class="check">
                  <input type="checkbox" bind:checked={infInferSlabs} />
                  {t('cad.inferSlabs')}
                </label>
                <label class="check sub" class:disabled={!infInferSlabs}>
                  <input type="checkbox" bind:checked={infSnapColumns} disabled={!infInferSlabs} />
                  {t('cad.inferSnapColumns')}
                </label>
                <label class="check">
                  <input type="checkbox" bind:checked={infPruneFloating} />
                  {t('cad.inferPruneFloating')}
                </label>
              </details>
              <details class="panel floors-panel">
                <summary>{t('cad.floorPlansPanel')}</summary>
                <div class="hint">{t('cad.floorPlansHint')}</div>
                {#each floorRegions as r, i}
                  <div class="region-row">
                    <input type="text" class="region-label" bind:value={r.label} title={t('cad.floorPlanLabel')} />
                    <span class="region-range">
                      {t('cad.floors')}
                      <input type="number" min="1" step="1" bind:value={r.fromFloor} />–
                      <input type="number" min="1" step="1" bind:value={r.toFloor} />
                    </span>
                    <span class="region-win" title={t('cad.floorPlanWindow')}>
                      [{r.x0.toFixed(1)},{r.y0.toFixed(1)}]–[{r.x1.toFixed(1)},{r.y1.toFixed(1)}]
                    </span>
                    <button class="btn mini" onclick={() => { floorRegions = floorRegions.filter((_, j) => j !== i); }}>✕</button>
                  </div>
                {/each}
                <button class="btn mini" onclick={addFloorRegion} disabled={!cropEnabled}>+ {t('cad.floorPlanAdd')}</button>
                {#if !cropEnabled}<div class="hint">{t('cad.floorPlanNeedCrop')}</div>{/if}
              </details>
            </div>
          {:else if step === 4 && draft}
            <div class="banner">{t('cad.draftBanner')}</div>
            <div class="preview-row">
              <div class="preview-pane">
                <canvas bind:this={previewCanvas} width="420" height="320"></canvas>
                <div class="legend">
                  <span><span class="role-dot" style="background:#e94560"></span>{t('cad.role.column')}</span>
                  <span><span class="role-dot" style="background:#4ecdc4"></span>{t('cad.role.beam')}</span>
                  <span><span class="role-dot" style="background:#6a9fe0"></span>{t('cad.role.slab')}</span>
                  <span><span class="role-dot" style="background:#f0a500"></span>{t('cad.role.wall')}</span>
                  <span><span class="role-dot" style="background:#ff5d5d"></span>{t('cad.diagFloatingNode')}</span>
                </div>
              </div>
              {#if diagnostics}
                <div class="diag-pane diag-{diagnostics.level}">
                  <div class="diag-head">
                    {diagnostics.level === 'ok' ? '✅' : diagnostics.level === 'warn' ? '⚠' : '⛔'}
                    <strong>{t(`cad.diagVerdict.${diagnostics.solvableShape ? 'ok' : diagnostics.level}`)}</strong>
                  </div>
                  <ul class="diag-list">
                    {#each diagnostics.checks as ck}
                      <li class="diag-{ck.level}">
                        {t(`cad.diag.${ck.id}`)
                          .replace('{n}', String(ck.values?.n ?? ''))
                          .replace('{orphans}', String(ck.values?.orphans ?? ''))}
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
            </div>
            <div class="split">
              <div class="left">
                <h3>{t('cad.draftCounts')}</h3>
                <table class="counts-table">
                  <tbody>
                    <tr><td>{t('cad.cNodes')}</td><td class="num">{draft.counts.nodes}</td></tr>
                    <tr><td>{t('cad.cColumns')}</td><td class="num">{draft.counts.columns}</td></tr>
                    <tr><td>{t('cad.cBeams')}</td><td class="num">{draft.counts.beams}</td></tr>
                    <tr><td>{t('cad.cSlabQuads')}</td><td class="num">{draft.counts.slabQuads}</td></tr>
                    <tr><td>{t('cad.cWallQuads')}</td><td class="num">{draft.counts.wallQuads}</td></tr>
                    <tr><td>{t('cad.cSupports')}</td><td class="num">{draft.counts.supports}</td></tr>
                    <tr><td>{t('cad.cLoads')}</td><td class="num">{draft.counts.loads}</td></tr>
                    <tr><td>{t('cad.cCombos')}</td><td class="num">{draft.counts.combinations}</td></tr>
                    <tr><td>{t('cad.cSplits')}</td><td class="num">{draft.counts.beamsSplit}</td></tr>
                    <tr><td>{t('cad.cOffsets')}</td><td class="num">{draft.counts.beamsWithOffsets}</td></tr>
                    <tr><td>{t('cad.cAmbiguous')}</td><td class="num">{draft.counts.offsetsAmbiguous}</td></tr>
                    <tr><td>{t('cad.cSchedAssign')}</td><td class="num">{draft.counts.scheduleAssignments}</td></tr>
                  </tbody>
                </table>
                {#if draft.counts.openingsDetected > 0}
                  <h3>{t('cad.openingsSummary')}</h3>
                  <div class="role-summary">
                    <span>{t('cad.openDetected')}: {draft.counts.openingsDetected}</span>
                    <span>{t('cad.openCut')}: {draft.counts.openingsCutFromSlabs}</span>
                    <span class:warn-text={draft.counts.openingsNotCut > 0}>{t('cad.openNotCut')}: {draft.counts.openingsNotCut}</span>
                  </div>
                {/if}
                <h3>{t('cad.specSummary')}</h3>
                <div class="role-summary">
                  <span>{t('cad.spec.schedule')}: {draft.counts.specSections.schedule}</span>
                  <span>{t('cad.spec.label')}: {draft.counts.specSections.label}</span>
                  <span>{t('cad.spec.geometry')}: {draft.counts.specSections.geometry}</span>
                  <span class:warn-text={draft.counts.specSections.default > 0}>{t('cad.spec.default')}: {draft.counts.specSections.default}</span>
                </div>
                {#if Object.keys(draft.counts.liveLoadByCategory).length > 0}
                  <h3>{t('cad.liveLoadSummary')}</h3>
                  <div class="role-summary">
                    {#each Object.entries(draft.counts.liveLoadByCategory) as [cat, nq]}
                      <span>{t(`cad.roomCat.${cat}`)}: {nq} {t('cad.quadFloors')}</span>
                    {/each}
                    {#if draft.counts.liveLoadDefaulted > 0}
                      <span class="warn-text">{t('cad.liveDefaulted')}: {draft.counts.liveLoadDefaulted}</span>
                    {/if}
                  </div>
                {/if}
                <h3>{t('cad.roleSummary')}</h3>
                <div class="role-summary">
                  {#each mappings.filter((m) => m.role !== 'ignore') as m}
                    <span><span class="role-dot" style="background:{ROLE_COLORS[m.role]}"></span>{m.layer} → {t(`cad.role.${m.role}`)}</span>
                  {/each}
                </div>
              </div>
              <div class="right scroll">
                {#if draft.warnings.length > 0}
                  <h3>{t('cad.warnings')}</h3>
                  {#each draft.warnings as w}
                    <div class="warn-line sev-{w.severity}">
                      {w.severity === 'info' ? 'ℹ' : '⚠'} {warnText(w.message)}
                    </div>
                  {/each}
                {/if}
                {#if skippedGroups.length > 0}
                  <h3>{t('cad.skipped')}</h3>
                  {#each skippedGroups as s}
                    <div class="warn-line sev-warning">
                      ⚠ {s.count} × {t(`cad.skip.${s.reason}`)} ({s.layer})
                    </div>
                  {/each}
                {/if}
                <h3>{t('cad.assumptions')}</h3>
                {#each draft.provenance.assumptions as a}
                  <div class="assumption-line">• {a}</div>
                {/each}
              </div>
            </div>
          {/if}
        {/if}
      </div>

      <div class="footer">
        <button class="btn" onclick={onclose}>{t('cad.cancel')}</button>
        <span class="spacer"></span>
        {#if step > 1}
          <button class="btn" onclick={() => { step = step - 1; }}>{t('cad.back')}</button>
        {/if}
        {#if step < 3}
          <button class="btn primary" disabled={!doc || !!error} onclick={() => { if (step === 2) prefillFromPlan(); step = step + 1; }}>
            {t('cad.next')}
          </button>
        {:else if step === 3}
          <button class="btn primary" disabled={!plan || !assumptionsValid || classifiedCount === 0}
            onclick={goPreview}>
            {t('cad.generateDraft')}
          </button>
        {:else}
          <button class="btn apply" disabled={!draft} onclick={handleApply}>{t('cad.apply')}</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6);
    display: flex; align-items: center; justify-content: center; z-index: 950;
  }
  .dialog {
    background: #16213e; border: 1px solid #1a4a7a; border-radius: 8px;
    width: 860px; max-width: 96vw; max-height: 92vh;
    display: flex; flex-direction: column; color: #ddd;
  }
  .header {
    display: flex; align-items: center; gap: 0.6rem;
    padding: 0.7rem 1rem; border-bottom: 1px solid #1a4a7a;
  }
  .header h2 { margin: 0; font-size: 1rem; color: #4ecdc4; }
  .file-name { font-size: 0.75rem; color: #888; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .close-btn { background: none; border: none; color: #888; cursor: pointer; font-size: 1rem; }
  .close-btn:hover { color: #fff; }

  .steps { display: flex; gap: 0.4rem; padding: 0.5rem 1rem; border-bottom: 1px solid #1a4a7a; flex-wrap: wrap; }
  .step-chip {
    font-size: 0.7rem; padding: 0.2rem 0.55rem; border-radius: 10px;
    background: #0f3460; color: #888; border: 1px solid #1a4a7a;
  }
  .step-chip.active { color: #4ecdc4; border-color: #4ecdc4; }
  .step-chip.done { color: #aaa; }

  .body { padding: 0.8rem 1rem; overflow-y: auto; flex: 1; min-height: 320px; }
  .split { display: flex; gap: 1rem; }
  .left { flex: 1; min-width: 0; }
  .right { width: 396px; flex-shrink: 0; }
  .right.scroll { overflow-y: auto; max-height: 56vh; }
  canvas { border: 1px solid #1a4a7a; border-radius: 4px; background: #10101c; width: 100%; }
  .legend { display: flex; flex-wrap: wrap; gap: 0.5rem; font-size: 0.65rem; color: #999; margin-top: 0.3rem; }
  .role-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }

  h3 { font-size: 0.7rem; text-transform: uppercase; color: #888; margin: 0.7rem 0 0.3rem; }
  .row { display: flex; align-items: center; gap: 0.5rem; margin: 0.3rem 0; font-size: 0.8rem; }
  .open-actions { display: flex; gap: 0.6rem; margin: 0.2rem 0 0.4rem; }
  .open-prompt { color: #888; font-style: italic; margin-top: 0.6rem; }
  .room-map { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.7rem; color: #9fd; margin: 0.25rem 0 0.1rem 1rem; }
  .hint { font-size: 0.72rem; color: #999; }
  .error {
    background: rgba(233, 69, 96, 0.15); border: 1px solid #e94560; color: #ff8a9e;
    padding: 0.45rem 0.6rem; border-radius: 4px; font-size: 0.78rem; margin-bottom: 0.6rem;
  }
  .gen-error {
    background: rgba(233, 69, 96, 0.15); border: 1px solid #e94560; color: #ff8a9e;
    padding: 0.55rem 0.7rem; border-radius: 4px; font-size: 0.8rem; margin-bottom: 0.7rem;
  }
  .gen-error-note { color: #ffc2cd; margin-top: 0.25rem; font-size: 0.75rem; }
  .gen-error-detail {
    margin: 0.45rem 0 0; padding: 0.4rem 0.5rem; max-height: 9rem; overflow: auto;
    background: rgba(0, 0, 0, 0.35); border-radius: 3px; color: #d88; font-size: 0.68rem;
    white-space: pre-wrap; word-break: break-word;
  }
  .banner {
    background: rgba(240, 165, 0, 0.1); border: 1px solid #f0a500; color: #f0c860;
    padding: 0.45rem 0.6rem; border-radius: 4px; font-size: 0.76rem; margin-bottom: 0.7rem;
  }

  .layer-table { width: 100%; border-collapse: collapse; font-size: 0.74rem; }
  .layer-table th { text-align: left; color: #888; font-weight: normal; padding: 0.2rem 0.3rem; border-bottom: 1px solid #1a4a7a; }
  .layer-table td { padding: 0.2rem 0.3rem; border-bottom: 1px solid #14233f; }
  .layer-name { font-family: monospace; }
  .num { text-align: right; color: #aaa; }
  .suggested { color: #999; }
  .role-guide { margin-top: 0.5rem; font-size: 0.72rem; }
  .role-guide > summary { cursor: pointer; color: #6cb6ff; user-select: none; }
  .role-guide dl { margin: 0.4rem 0 0; display: flex; flex-direction: column; gap: 0.3rem; }
  .role-guide-row { display: grid; grid-template-columns: 6.5rem 1fr; gap: 0.5rem; align-items: baseline; }
  .role-guide dt { color: #cfe3ff; text-transform: capitalize; white-space: nowrap; }
  .role-guide dd { margin: 0; color: #9aa7b8; line-height: 1.3; }
  .conf { font-size: 0.6rem; padding: 0 0.25rem; border-radius: 6px; margin-left: 0.25rem; }
  .conf-high { background: rgba(78, 205, 196, 0.18); color: #4ecdc4; }
  .conf-medium { background: rgba(240, 165, 0, 0.15); color: #f0a500; }
  .conf-low { background: rgba(255, 255, 255, 0.06); color: #888; }

  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
  details.panel { border: 1px solid #1a4a7a; border-radius: 6px; padding: 0.4rem 0.7rem 0.5rem; }
  details.panel > summary {
    font-size: 0.68rem; text-transform: uppercase; color: #888; cursor: pointer;
    margin: 0 -0.2rem 0.2rem; user-select: none;
  }
  details.panel > summary:hover { color: #4ecdc4; }
  .sched-row { display: flex; gap: 0.3rem; margin: 0.25rem 0; }
  .sched-row select { flex: 0 0 90px; }
  .sched-row input { width: 70px; padding: 0.25rem 0.4rem; background: #0f3460; color: #ddd; border: 1px solid #1a4a7a; border-radius: 4px; font-size: 0.72rem; }
  .btn.mini { padding: 0.15rem 0.5rem; font-size: 0.7rem; }
  .warn-text { color: #f0a500; }
  .form-grid label { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; font-size: 0.76rem; margin: 0.3rem 0; }
  .form-grid input[type='number'], .form-grid input[type='text'] {
    width: 110px; padding: 0.25rem 0.4rem; background: #0f3460; color: #ddd;
    border: 1px solid #1a4a7a; border-radius: 4px; font-size: 0.76rem;
  }
  .pair { display: flex; align-items: center; gap: 0.25rem; }
  .pair input { width: 60px !important; }
  .check { justify-content: flex-start !important; }
  select {
    padding: 0.25rem 0.4rem; background: #0f3460; color: #ddd;
    border: 1px solid #1a4a7a; border-radius: 4px; font-size: 0.74rem;
  }

  .counts-table { width: 100%; border-collapse: collapse; font-size: 0.76rem; }
  .counts-table td { padding: 0.16rem 0.3rem; border-bottom: 1px solid #14233f; }
  .role-summary { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.72rem; }
  .warn-line { font-size: 0.74rem; color: #f0a500; padding: 0.12rem 0; }
  .warn-line.sev-info { color: #6a9fe0; }
  .warn-line.sev-error { color: #ff8a9e; }
  .assumption-line { font-size: 0.72rem; color: #bbb; padding: 0.12rem 0; }

  .footer {
    display: flex; gap: 0.5rem; padding: 0.7rem 1rem; border-top: 1px solid #1a4a7a;
  }
  .spacer { flex: 1; }
  .btn {
    padding: 0.4rem 0.9rem; border-radius: 4px; font-size: 0.78rem; cursor: pointer;
    background: #0f3460; color: #ccc; border: 1px solid #1a4a7a;
  }
  .btn:hover:not(:disabled) { border-color: #4ecdc4; color: #fff; }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .btn.primary { background: rgba(78, 205, 196, 0.15); color: #4ecdc4; border-color: #4ecdc4; }
  .btn.apply { background: rgba(78, 205, 196, 0.25); color: #4ecdc4; border-color: #4ecdc4; font-weight: 600; }

  /* PR [14] — unit sanity, crop, contribution, inference, multi-floor, preview, diagnostics */
  .unit-warn {
    background: rgba(240, 165, 0, 0.14); border: 1px solid #f0a500; color: #f0c860;
    padding: 0.4rem 0.55rem; border-radius: 4px; font-size: 0.74rem; margin: 0.3rem 0;
    display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
  }
  .crop-panel { margin-top: 0.5rem; }
  .crop-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.3rem; margin: 0.3rem 0; }
  .crop-grid.disabled { opacity: 0.5; }
  .crop-grid label { display: flex; align-items: center; gap: 0.3rem; font-size: 0.72rem; }
  .crop-grid input { width: 80px; padding: 0.2rem 0.35rem; background: #0f3460; color: #ddd; border: 1px solid #1a4a7a; border-radius: 4px; font-size: 0.72rem; }
  .crop-actions { display: flex; gap: 0.4rem; }
  .layer-breakdown { font-size: 0.62rem; color: #6f7d90; margin-left: 0.95rem; }
  .layer-table .contrib { font-size: 0.72rem; white-space: nowrap; }
  .layer-table .contrib span { margin-right: 0.2rem; }
  .contrib-zero { color: #c46; font-weight: 600; }
  .infer-panel .warn-text { margin-bottom: 0.3rem; }
  .check.sub { margin-left: 1.1rem; }
  .check.sub.disabled { opacity: 0.5; }
  .region-row { display: flex; align-items: center; gap: 0.35rem; margin: 0.25rem 0; font-size: 0.72rem; flex-wrap: wrap; }
  .region-row input[type='text'] { width: 78px; }
  .region-row input[type='number'] { width: 42px; padding: 0.2rem 0.3rem; background: #0f3460; color: #ddd; border: 1px solid #1a4a7a; border-radius: 4px; }
  .region-win { color: #8194ab; font-size: 0.66rem; }
  .preview-row { display: flex; gap: 0.8rem; margin-bottom: 0.7rem; align-items: stretch; }
  .preview-pane canvas { border: 1px solid #1a4a7a; border-radius: 4px; background: #10101c; }
  .diag-pane { flex: 1; border-radius: 6px; padding: 0.5rem 0.7rem; font-size: 0.76rem; overflow-y: auto; max-height: 340px; }
  .diag-pane.diag-ok { background: rgba(78, 205, 196, 0.1); border: 1px solid #2f8f86; }
  .diag-pane.diag-warn { background: rgba(240, 165, 0, 0.1); border: 1px solid #f0a500; }
  .diag-pane.diag-error { background: rgba(233, 69, 96, 0.12); border: 1px solid #e94560; }
  .diag-head { font-size: 0.85rem; margin-bottom: 0.4rem; }
  .diag-list { margin: 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: 0.2rem; }
  .diag-list li.diag-error { color: #ff8a9e; }
  .diag-list li.diag-warn { color: #f0c860; }
  .diag-list li.diag-ok { color: #7fe0d6; }
</style>
