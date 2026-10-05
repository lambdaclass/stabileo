<script lang="ts">
  import { decimalOrKeep } from '../../lib/utils/numeric-input';
  import { plainNumber } from '../../lib/utils/units';
  import PickKind from './PickKind.svelte';
  import ProLoadCases from './ProLoadCases.svelte';
  import ProCombinationsList from './ProCombinationsList.svelte';
  import { windCaseReversible } from '../../lib/store/wind-reversal';
  import { generateCombinations } from '../../lib/codes/cirsoc101/combinations';
  import { ruleToSpec } from '../../lib/engine/loads/combination-rules';
  import ProFloorLoadSection from './ProFloorLoadSection.svelte';
  import { generateServiceCombinations } from '../../lib/codes/cirsoc101/service-combinations';
  import { expandCombinations, presentSymbols, type CaseCombination } from '../../lib/engine/loads/combination-cases';
  import { addGeneratedCombinations } from '../../lib/store/generated-combinations';
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import WriteInPanelButton from './WriteInPanelButton.svelte';
  import WriteCard from './WriteCard.svelte';
  import { drawState } from '../../lib/store/draw-state.svelte';
  import DrawInModelButton from './DrawInModelButton.svelte';
  import ProAutoLoadsDialog from './ProAutoLoadsDialog.svelte';
  import type { AutoLoadFocus } from './ProAutoLoadsDialog.svelte';

  let showAutoLoadsDialog = $state(false);

  type LoadKind = 'nodal' | 'distributed' | 'point' | 'surface' | 'thermalQuad';

  let loadKind = $state<LoadKind>('nodal');
  /*
   * The case new loads go to is the one "Draw load" uses too (`uiStore.activeLoadCaseId`). This
   * table kept its own, so a load drawn in the viewport went to Basic's case, not the one chosen
   * here.
   */

  // Nodal load fields
  let nlNodeId = $state('');
  let nlFx = $state('');
  let nlFy = $state('');
  let nlFz = $state('');
  let nlMx = $state('');
  let nlMy = $state('');
  let nlMz = $state('');

  // Distributed load fields
  let dlElemId = $state('');
  let dlQyI = $state('');
  let dlQyJ = $state('');
  let dlQzI = $state('');
  let dlQzJ = $state('');
  /** Axes of a new distributed load, and its x component (axial when local). */
  let dlFrame = $state<'local' | 'global' | 'projected'>('local');
  let dlQxI = $state('');
  let dlQxJ = $state('');

  // Point load on element fields
  let plElemId = $state('');
  let plA = $state('');
  let plPy = $state('');
  let plPz = $state('');

  // Surface load fields
  let slQuadId = $state('');
  let slQ = $state('');

  // Thermal quad load fields
  let tqQuadId = $state('');
  let tqDtUniform = $state('');
  let tqDtGradient = $state('');

  const loads = $derived(modelStore.loads);
  const loadCases = $derived(modelStore.model.loadCases);
  const combinations = $derived(modelStore.model.combinations);

  // Filter loads by active case
  const caseLoads = $derived(loads.filter(l => (l.data.caseId ?? 1) === uiStore.activeLoadCaseId));
  const nodalLoads = $derived(caseLoads.filter(l => l.type === 'nodal3d'));
  const distLoads = $derived(caseLoads.filter(l => l.type === 'distributed3d'));
  const pointLoads = $derived(caseLoads.filter(l => l.type === 'pointOnElement3d'));
  const surfaceLoads = $derived(caseLoads.filter(l => l.type === 'surface3d'));
  const thermalQuadLoads = $derived(caseLoads.filter(l => l.type === 'thermalQuad3d'));

  /** Select a load in the viewport by its data.id. */
  function selectLoadById(dataId: number) {
    // Guard against stale ids (e.g. a click event racing a deletion).
    if (!modelStore.loads.some(l => l.data.id === dataId)) return;
    uiStore.selectMode = 'loads';
    uiStore.selectLoad(dataId, false);
  }

  /** Check if a load is currently selected by its data.id. */
  function isLoadSelected(dataId: number): boolean {
    return uiStore.selectedLoads.has(dataId);
  }

  function addNodalLoad() {
    const nodeId = parseInt(nlNodeId);
    if (isNaN(nodeId) || !modelStore.nodes.has(nodeId)) return;
    const fx = parseFloat(nlFx) || 0;
    const fy = parseFloat(nlFy) || 0;
    const fz = parseFloat(nlFz) || 0;
    const mx = parseFloat(nlMx) || 0;
    const my = parseFloat(nlMy) || 0;
    const mz = parseFloat(nlMz) || 0;
    if (fx === 0 && fy === 0 && fz === 0 && mx === 0 && my === 0 && mz === 0) return;
    modelStore.addNodalLoad3D(nodeId, fx, fy, fz, mx, my, mz, uiStore.activeLoadCaseId);
    nlNodeId = ''; nlFx = ''; nlFy = ''; nlFz = ''; nlMx = ''; nlMy = ''; nlMz = '';
  }

  /** The distributed load being typed, or null when all of it is zero. */
  function distDraft() {
    const qxI = parseFloat(dlQxI) || 0, qxJ = parseFloat(dlQxJ) || qxI;
    const qyI = parseFloat(dlQyI) || 0, qyJ = parseFloat(dlQyJ) || qyI;
    const qzI = parseFloat(dlQzI) || 0, qzJ = parseFloat(dlQzJ) || qzI;
    if ([qxI, qxJ, qyI, qyJ, qzI, qzJ].every((v) => v === 0)) return null;
    return { qyI, qyJ, qzI, qzJ, opts: { frame: dlFrame, qXI: qxI, qXJ: qxJ } };
  }
  function clearDist() { dlQxI = ''; dlQxJ = ''; dlQyI = ''; dlQyJ = ''; dlQzI = ''; dlQzJ = ''; }

  function addDistLoad() {
    const elemId = parseInt(dlElemId);
    if (isNaN(elemId) || !modelStore.elements.has(elemId)) return;
    const d = distDraft();
    if (!d) return;
    modelStore.addDistributedLoad3D(elemId, d.qyI, d.qyJ, d.qzI, d.qzJ, undefined, undefined, uiStore.activeLoadCaseId, d.opts);
    dlElemId = ''; clearDist();
  }

  function addPointLoad() {
    const elemId = parseInt(plElemId);
    if (isNaN(elemId) || !modelStore.elements.has(elemId)) return;
    const a = parseFloat(plA);
    const py = parseFloat(plPy) || 0;
    const pz = parseFloat(plPz) || 0;
    if (isNaN(a) || a < 0 || (py === 0 && pz === 0)) return;
    modelStore.addPointLoadOnElement3D(elemId, a, py, pz, uiStore.activeLoadCaseId);
    plElemId = ''; plA = ''; plPy = ''; plPz = '';
  }

  function addSurfaceLoad() {
    const quadId = parseInt(slQuadId);
    if (isNaN(quadId)) return;
    if (!modelStore.model.quads.has(quadId)) {
      uiStore.toast(t('pro.noQuadFound'), 'error');
      return;
    }
    const q = parseFloat(slQ) || 0;
    if (q === 0) return;
    modelStore.addSurfaceLoad3D(quadId, q, uiStore.activeLoadCaseId);
    slQuadId = ''; slQ = '';
  }

  function addThermalQuadLoad() {
    const quadId = parseInt(tqQuadId);
    if (isNaN(quadId) || !modelStore.model.quads.has(quadId)) return;
    const dtU = parseFloat(tqDtUniform) || 0;
    const dtG = parseFloat(tqDtGradient) || 0;
    if (dtU === 0 && dtG === 0) return;
    modelStore.addThermalLoadQuad3D(quadId, dtU, dtG, uiStore.activeLoadCaseId);
    tqQuadId = ''; tqDtUniform = ''; tqDtGradient = '';
  }

  function addNodalLoadToSelection() {
    const fx = parseFloat(nlFx) || 0, fy = parseFloat(nlFy) || 0, fz = parseFloat(nlFz) || 0;
    const mx = parseFloat(nlMx) || 0, my = parseFloat(nlMy) || 0, mz = parseFloat(nlMz) || 0;
    if (fx === 0 && fy === 0 && fz === 0 && mx === 0 && my === 0 && mz === 0) return;
    for (const nodeId of uiStore.selectedNodes) {
      if (modelStore.nodes.has(nodeId)) modelStore.addNodalLoad3D(nodeId, fx, fy, fz, mx, my, mz, uiStore.activeLoadCaseId);
    }
    nlFx = ''; nlFy = ''; nlFz = ''; nlMx = ''; nlMy = ''; nlMz = '';
  }

  function addDistLoadToSelection() {
    const d = distDraft();
    if (!d) return;
    modelStore.batch(() => {
      for (const elemId of uiStore.selectedElements) {
        if (modelStore.elements.has(elemId)) modelStore.addDistributedLoad3D(elemId, d.qyI, d.qyJ, d.qzI, d.qzJ, undefined, undefined, uiStore.activeLoadCaseId, d.opts);
      }
    });
    clearDist();
  }

  function addPointLoadToSelection() {
    const a = parseFloat(plA), py = parseFloat(plPy) || 0, pz = parseFloat(plPz) || 0;
    if (isNaN(a) || a < 0 || (py === 0 && pz === 0)) return;
    for (const elemId of uiStore.selectedElements) {
      if (modelStore.elements.has(elemId)) modelStore.addPointLoadOnElement3D(elemId, a, py, pz, uiStore.activeLoadCaseId);
    }
    plA = ''; plPy = ''; plPz = '';
  }

  function removeLoad(loadId: number) {
    modelStore.removeLoad(loadId);
    // Drop the deleted load from the selection so a later Delete keypress
    // doesn't act on a stale id.
    uiStore.deleteSelectedLoad(loadId);
  }

  // ─── Combination Generator with Review Modal ──────────

  type ComboTemplate = 'lrfd' | 'service' | 'project';

  interface CandidateCombo {
    name: string;
    factors: Array<{caseId: number; factor: number}>;
    exists: boolean;
    selected: boolean;
    template: ComboTemplate;
    /** The generated combination, so service ones reach the service envelope. */
    generated: CaseCombination;
  }

  let showComboModal = $state(false);
  let candidateCombos = $state<CandidateCombo[]>([]);
  let activeTemplate = $state<ComboTemplate>('lrfd');
  const hasWindCases = $derived(modelStore.model.loadCases.some((c) => (c.type || '').toUpperCase() === 'W'));
  const hasSeismicCases = $derived(modelStore.model.loadCases.some((c) => (c.type || '').toUpperCase() === 'E'));
  /**
   * Earthquake in both senses by sign, on by default: a seismic case reversed is the same
   * action the other way. Wind by sign is off by default: the code's wind cases already hold
   * each direction as a case of its own, and a roof suction times −1 is a pressure that never
   * acts. It is there for a wind case loaded by hand in one sense (`combination-cases.ts`).
   */
  let seismicBothSenses = $state(true);
  let windBySign = $state(false);

  function comboExists(factors: Array<{caseId: number; factor: number}>): boolean {
    const sig = comboSignature(factors);
    return combinations.some(c => comboSignature(c.factors) === sig);
  }

  function comboSignature(factors: Array<{caseId: number; factor: number}>): string {
    return factors
      .filter(f => Math.abs(f.factor) > 1e-9)
      .sort((a, b) => a.caseId - b.caseId)
      .map(f => `${f.caseId}:${f.factor.toFixed(2)}`)
      .join('|');
  }

  function buildCandidates(template: ComboTemplate): CandidateCombo[] {
    return candidatesFrom(template);
  }

  /**
   * Candidates from the regulation's generators, onto this model's cases.
   *
   * Strength: CIRSOC 101-2025 §2.3.2 (1,0 W, with strength-level wind). Service: the
   * characteristic combinations. Both come from the same code as the regulation dialog, and
   * expand one wind or seismic direction at a time (`combination-cases.ts`). This tab used to
   * carry its own tables: one labelled ASCE 7-22 with 1,6 W, which neither code prints now,
   * and an ASD set labelled "service", which is allowable-stress design and not serviceability.
   */
  function candidatesFrom(template: ComboTemplate): CandidateCombo[] {
    const cases = modelStore.model.loadCases;
    const present = presentSymbols(cases);
    // The project's rules carry their own factors: W is written as the engineer means it.
    const specs = template === 'project'
      ? modelStore.combinationRules.map(ruleToSpec)
      : template === 'service'
      ? generateServiceCombinations({ present })
      : generateCombinations({ present });
    const out = expandCombinations(specs, cases, {
      bothSenses: { W: windBySign, E: seismicBothSenses },
      // A wind case with roof suction is not reversed by sign (store/wind-reversal.ts).
      reversible: (id) => windCaseReversible(modelStore.model, id),
    }).map((c) => {
      const factors = cases.map((lc) => ({ caseId: lc.id, factor: c.factors.find((f) => f.caseId === lc.id)?.factor ?? 0 }));
      return { name: c.name, factors, exists: comboExists(factors), selected: false, template, generated: c };
    });
    for (const c of out) c.selected = !c.exists;
    return out;
  }

  function openComboGenerator(template: ComboTemplate) {
    if ((modelStore.model.loadCases.find(c => (c.type || '').toUpperCase() === 'D')) == null) {
      uiStore.toast(t('pro.needDeadCase'), 'error');
      return;
    }
    activeTemplate = template;
    candidateCombos = buildCandidates(template);
    showComboModal = true;
  }

  function applySelectedCombos() {
    const toAdd = candidateCombos.filter(c => c.selected);
    if (toAdd.length === 0) { showComboModal = false; return; }
    const prefix = activeTemplate === 'service' ? 'S' : activeTemplate === 'project' ? 'P' : 'U';
    // Continue numbering from the highest existing index for this prefix (not a
    // count): counting reuses a number after an earlier combo is deleted, which
    // produces duplicate names like two "U3: …".
    const pattern = new RegExp(`^${prefix}(\\d+):`);
    let n = combinations.reduce((max, c) => {
      const m = c.name.match(pattern);
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    modelStore.batch(() => {
      addGeneratedCombinations(toAdd.map((c) => ({ ...c.generated, name: c.name })), () => `${prefix}${++n}: `);
    });
    showComboModal = false;
    const label = activeTemplate === 'service' ? t('pro.serviceCombosGenerated') : t('pro.combosGenerated');
    uiStore.toast(`${toAdd.length} ${label}`, 'success');
  }

  /** The stored value, whole: two decimals showed 0,004 kN as 0,00 in a cell that edits it. */
  function fmtNum(n: number): string {
    return plainNumber(n, 6);
  }

  /** A typed load component, read by the app's one reader (a comma or a point, thousands grouped
   *  by the other). Text it cannot read («12 kN», «1.2.3») changes nothing and the cell shows the
   *  stored value again; it used to be written as 0. An empty cell clears the component. */
  function setNum(el: HTMLInputElement, id: number, key: string, previous: number | undefined) {
    const prev = previous ?? 0;
    const v = decimalOrKeep(el.value, prev);
    el.value = fmtNum(v);
    if (v !== prev) modelStore.updateLoad(id, { [key]: v });
  }

  /*
   * Which part of the load definition is being edited. Cases first: a load
   * belongs to a case, so the case is chosen before the load exists.
   */
  let loadSection = $state('cases');

  let autoLoadsFocus = $state<AutoLoadFocus | null>(null);
</script>

<div class="pro-loads">
  <!-- Drawing works the MODEL, so it sits beside the other things you do to a
       load rather than as a band across the panel. -->
  <div class="pro-autogen-bar">
    <DrawInModelButton tool="load" label={t('pro.oneLoad')} icon="load" testid="draw-load" />
    <WriteInPanelButton kind="load" label={t('pro.oneLoad')} testid="write-load" />
    <button class="pro-btn-autogen" data-testid="pro-auto-loads-btn"
      onclick={() => showAutoLoadsDialog = true}>{t('autoLoad.autoGenBtn')}</button>
  </div>

  <!-- Write a load: the card the "Write load" button opens, beside "Draw load". -->
  {#if drawState.writing === 'load'}
  <div class="pro-addload-section">
  <WriteCard title={`${t('pro.writeIn')} ${t('pro.oneLoad')}`} testid="write-load-card">
    <label>{t('pro.writeLoadCase')}
      <select bind:value={uiStore.activeLoadCaseId} data-testid="write-load-case">
        {#each loadCases as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
      </select>
    </label>
  <div class="pro-section-content">

  <!-- Load kind selector -->
  <div class="pro-loads-form">
    <div class="pro-kind-row">
      <button class="pro-type-btn" class:active={loadKind === 'nodal'} onclick={() => loadKind = 'nodal'}>{t('pro.nodal')}</button>
      <button class="pro-type-btn" class:active={loadKind === 'distributed'} onclick={() => loadKind = 'distributed'}>{t('pro.distributed')}</button>
      <button class="pro-type-btn" class:active={loadKind === 'point'} onclick={() => loadKind = 'point'}>{t('pro.pointLoad')}</button>
      <button class="pro-type-btn" class:active={loadKind === 'surface'} onclick={() => loadKind = 'surface'}>{t('pro.surfaceLoad')}</button>
      <button class="pro-type-btn" class:active={loadKind === 'thermalQuad'} onclick={() => loadKind = 'thermalQuad'}>{t('pro.thermalQuadLoad')}</button>
    </div>

    {#if loadKind === 'nodal'}
      <div class="pro-load-inputs">
        <div class="pro-load-row">
          <label>Fx: <input type="text" bind:value={nlFx} placeholder="kN" class="inp-num" /></label>
          <label>Fy: <input type="text" bind:value={nlFy} placeholder="kN" class="inp-num" /></label>
          <label>Fz: <input type="text" bind:value={nlFz} placeholder="kN" class="inp-num" /></label>
        </div>
        <div class="pro-load-row">
          <label>Mx: <input type="text" bind:value={nlMx} placeholder="kN·m" class="inp-num" /></label>
          <label>My: <input type="text" bind:value={nlMy} placeholder="kN·m" class="inp-num" /></label>
          <label>Mz: <input type="text" bind:value={nlMz} placeholder="kN·m" class="inp-num" /></label>
        </div>
        <div class="pro-load-target">
          <div class="target-byid">
            <label>{t('pro.thNode')}: <input type="text" bind:value={nlNodeId} placeholder="ID" class="inp-sm" /></label>
            <button class="pro-btn" onclick={addNodalLoad}>{t('pro.addNodalLoad')}</button>
          </div>
          {#if uiStore.selectedNodes.size > 0}
            <div class="target-sel">
              <button class="pro-btn pro-btn-sel" onclick={addNodalLoadToSelection}>{uiStore.selectedNodes.size} {t('pro.selectedNodes')}</button>
            </div>
          {:else}
            <div class="target-sel"><PickKind kind="nodes" /></div>
          {/if}
        </div>
      </div>
    {:else if loadKind === 'distributed'}
      <div class="pro-load-inputs">
        <div class="pro-load-row">
          <label>{t('loads.frame')}
            <select bind:value={dlFrame} data-testid="dl-frame" title={t('loads.frameHelp')}>
              <option value="local">{t('loads.frame.local')}</option>
              <option value="global">{t('loads.frame.global')}</option>
              <option value="projected">{t('loads.frame.projected')}</option>
            </select>
          </label>
        </div>
        <div class="pro-load-row">
          <label>{dlFrame === 'local' ? 'qx_i' : 'qX_i'}: <input type="text" bind:value={dlQxI} placeholder="kN/m" class="inp-num" data-testid="dl-qxi" /></label>
          <label>{dlFrame === 'local' ? 'qx_j' : 'qX_j'}: <input type="text" bind:value={dlQxJ} placeholder="kN/m" class="inp-num" /></label>
        </div>
        <div class="pro-load-row">
          <label>qY_i: <input type="text" bind:value={dlQyI} placeholder="kN/m" class="inp-num" /></label>
          <label>qY_j: <input type="text" bind:value={dlQyJ} placeholder="kN/m" class="inp-num" /></label>
        </div>
        <div class="pro-load-row">
          <label>qZ_i: <input type="text" bind:value={dlQzI} placeholder="kN/m" class="inp-num" /></label>
          <label>qZ_j: <input type="text" bind:value={dlQzJ} placeholder="kN/m" class="inp-num" /></label>
        </div>
        <div class="pro-load-target">
          <div class="target-byid">
            <label>{t('pro.thElements')}: <input type="text" bind:value={dlElemId} placeholder="ID" class="inp-sm" /></label>
            <button class="pro-btn" onclick={addDistLoad}>{t('pro.addDistLoad')}</button>
          </div>
          {#if uiStore.selectedElements.size > 0}
            <div class="target-sel">
              <button class="pro-btn pro-btn-sel" onclick={addDistLoadToSelection}>{tp('loads.onSelectedMembers', { n: uiStore.selectedElements.size })}</button>
            </div>
          {:else}
            <div class="target-sel"><PickKind kind="elements" /></div>
          {/if}
        </div>
      </div>
    {:else if loadKind === 'point'}
      <div class="pro-load-inputs">
        <div class="pro-load-row">
          <label>a (m): <input type="text" bind:value={plA} placeholder="dist." class="inp-num" /></label>
          <label>Py: <input type="text" bind:value={plPy} placeholder="kN" class="inp-num" /></label>
          <label>Pz: <input type="text" bind:value={plPz} placeholder="kN" class="inp-num" /></label>
        </div>
        <div class="pro-load-target">
          <div class="target-byid">
            <label>{t('pro.thElements')}: <input type="text" bind:value={plElemId} placeholder="ID" class="inp-sm" /></label>
            <button class="pro-btn" onclick={addPointLoad}>{t('pro.addPointLoad')}</button>
          </div>
          {#if uiStore.selectedElements.size > 0}
            <div class="target-sel">
              <button class="pro-btn pro-btn-sel" onclick={addPointLoadToSelection}>{tp('loads.onSelectedMembers', { n: uiStore.selectedElements.size })}</button>
            </div>
          {:else}
            <div class="target-sel"><PickKind kind="elements" /></div>
          {/if}
        </div>
      </div>
    {:else if loadKind === 'surface'}
      <div class="pro-load-inputs">
        <div class="pro-load-row">
          <label>{t('pro.slab')}: <input type="text" bind:value={slQuadId} placeholder="ID" class="inp-sm" /></label>
          <label>q: <input type="text" bind:value={slQ} placeholder="kN/m²" class="inp-num" /></label>
        </div>
        <button class="pro-btn" onclick={addSurfaceLoad}>{t('pro.addSurfaceLoad')}</button>
      </div>
    {:else}
      <div class="pro-load-inputs">
        <div class="pro-load-row">
          <label>{t('pro.slab')}: <input type="text" bind:value={tqQuadId} placeholder="ID" class="inp-sm" /></label>
        </div>
        <div class="pro-load-row">
          <label>{t('pro.dtUniform')}: <input type="text" bind:value={tqDtUniform} placeholder="°C" class="inp-num" /></label>
          <label>{t('pro.dtGradient')}: <input type="text" bind:value={tqDtGradient} placeholder="°C" class="inp-num" /></label>
        </div>
        <button class="pro-btn" onclick={addThermalQuadLoad}>{t('pro.addThermalQuadLoad')}</button>
      </div>
    {/if}
  </div>
  </div>
  </WriteCard>
  </div>
  {/if}

  <ProAutoLoadsDialog open={showAutoLoadsDialog} focus={autoLoadsFocus}
    onclose={() => { showAutoLoadsDialog = false; autoLoadsFocus = null; }} />

  <!-- Load Cases Management (collapsible) -->
  <div class="pro-cases-section">
    <!--
      One question — which part of the load definition am I editing — asked
      once.
      ────────────────────────────────────────────────────────────────────
      Load cases, combinations and the load-entry form were three collapsible
      sections stacked in one column, the first and third open by default. So
      the case table and the entry form competed for the same height while the
      combinations sat between them, and adding a load to a case you had just
      selected meant scrolling past twelve combinations to reach the form.

      They are three stages of one task, not three things to watch at once. The
      strip carries each one's count, so you can see there are ten cases and
      twelve combinations without opening either.
    -->
    <div class="load-tabs" role="tablist">
      {#each [
        { id: 'cases', labelKey: 'pro.loadCases', n: loadCases.length },
        { id: 'combos', labelKey: 'pro.combos', n: combinations.length },
        { id: 'floor', labelKey: 'floorLoad.tab', n: null },
      ] as sec (sec.id)}
        <button
          class="load-tab"
          class:on={loadSection === sec.id}
          role="tab"
          aria-selected={loadSection === sec.id}
          onclick={() => (loadSection = sec.id)}
          data-testid="load-tab-{sec.id}"
        >{t(sec.labelKey)}{#if sec.n !== null}<span class="load-tab-n">{sec.n}</span>{/if}</button>
      {/each}
    </div>

    {#if loadSection === 'cases'}
      <div class="pro-section-content">
        <ProLoadCases oncode={(f) => { autoLoadsFocus = f; showAutoLoadsDialog = true; }} />
      </div>
    {/if}
  </div>

  <!-- Combinations -->
  <div class="pro-combos-section">
    {#if loadSection === 'combos'}
      <ProCombinationsList ongenerate={openComboGenerator} oneditrules={() => { autoLoadsFocus = 'combos'; showAutoLoadsDialog = true; }} />
    {/if}
  </div>

  {#if loadSection === 'floor'}
    <div class="pro-section-content"><ProFloorLoadSection /></div>
  {/if}


  <!-- Loads table for active case -->
  <div class="pro-loads-table-wrap">
    {#if nodalLoads.length > 0}
      <div class="pro-load-section-title">{t('pro.nodalLoads')}</div>
      <table class="pro-loads-table">
        <thead><tr><th>ID</th><th>Nodo</th><th>Fx (kN)</th><th>Fy (kN)</th><th>Fz (kN)</th><th>Mx (kN·m)</th><th>My (kN·m)</th><th>Mz (kN·m)</th><th></th></tr></thead>
        <tbody>
          {#each nodalLoads as l}
            <tr class:selected={isLoadSelected(l.data.id)} onclick={() => selectLoadById(l.data.id)}>
              <td class="col-id">{l.data.id}</td>
              <td class="col-num">{l.data.nodeId}</td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.fx)} onclick={(e) => e.stopPropagation()} onchange={(e) => setNum(e.currentTarget, l.data.id, 'fx', l.data.fx)} /></td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.fy)} onclick={(e) => e.stopPropagation()} onchange={(e) => setNum(e.currentTarget, l.data.id, 'fy', l.data.fy)} /></td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.fz ?? 0)} onclick={(e) => e.stopPropagation()} onchange={(e) => setNum(e.currentTarget, l.data.id, 'fz', l.data.fz ?? 0)} /></td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.mx ?? 0)} onclick={(e) => e.stopPropagation()} onchange={(e) => setNum(e.currentTarget, l.data.id, 'mx', l.data.mx ?? 0)} /></td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.my ?? 0)} onclick={(e) => e.stopPropagation()} onchange={(e) => setNum(e.currentTarget, l.data.id, 'my', l.data.my ?? 0)} /></td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.mz ?? 0)} onclick={(e) => e.stopPropagation()} onchange={(e) => setNum(e.currentTarget, l.data.id, 'mz', l.data.mz ?? 0)} /></td>
              <td><button class="pro-delete-btn" onclick={(e) => { e.stopPropagation(); removeLoad(l.data.id); }}>×</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if distLoads.length > 0}
      <div class="pro-load-section-title">{t('pro.distLoads')}</div>
      <table class="pro-loads-table">
        <thead><tr><th>ID</th><th>{t('table.elemLabel')}</th><th>{t('loads.frame')}</th><th>qx_i (kN/m)</th><th>qx_j</th><th>qY_i</th><th>qY_j</th><th>qZ_i</th><th>qZ_j</th><th></th></tr></thead>
        <tbody>
          {#each distLoads as l}
            <tr class:selected={isLoadSelected(l.data.id)} onclick={() => selectLoadById(l.data.id)}>
              <td class="col-id">{l.data.id}</td>
              <td class="col-num">{l.data.elementId}</td>
              <td>
                <select class="inp-cell" value={l.data.frame ?? 'local'} onclick={(e) => e.stopPropagation()}
                  onchange={(e) => modelStore.updateLoad(l.data.id, { frame: e.currentTarget.value })}>
                  <option value="local">{t('loads.frame.local')}</option>
                  <option value="global">{t('loads.frame.global')}</option>
                  <option value="projected">{t('loads.frame.projected')}</option>
                </select>
              </td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.qXI ?? 0)} onclick={(e) => e.stopPropagation()} onchange={(e) => setNum(e.currentTarget, l.data.id, 'qXI', l.data.qXI ?? 0)} /></td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.qXJ ?? 0)} onclick={(e) => e.stopPropagation()} onchange={(e) => setNum(e.currentTarget, l.data.id, 'qXJ', l.data.qXJ ?? 0)} /></td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.qYI ?? 0)} onclick={(e) => e.stopPropagation()} onchange={(e) => setNum(e.currentTarget, l.data.id, 'qYI', l.data.qYI ?? 0)} /></td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.qYJ ?? 0)} onclick={(e) => e.stopPropagation()} onchange={(e) => setNum(e.currentTarget, l.data.id, 'qYJ', l.data.qYJ ?? 0)} /></td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.qZI ?? 0)} onclick={(e) => e.stopPropagation()} onchange={(e) => setNum(e.currentTarget, l.data.id, 'qZI', l.data.qZI ?? 0)} /></td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.qZJ ?? 0)} onclick={(e) => e.stopPropagation()} onchange={(e) => setNum(e.currentTarget, l.data.id, 'qZJ', l.data.qZJ ?? 0)} /></td>
              <td><button class="pro-delete-btn" onclick={(e) => { e.stopPropagation(); removeLoad(l.data.id); }}>×</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if pointLoads.length > 0}
      <div class="pro-load-section-title">{t('pro.pointLoads')}</div>
      <table class="pro-loads-table">
        <thead><tr><th>ID</th><th>{t('table.elemLabel')}</th><th>a (m)</th><th>Py (kN)</th><th>Pz (kN)</th><th></th></tr></thead>
        <tbody>
          {#each pointLoads as l}
            <tr class:selected={isLoadSelected(l.data.id)} onclick={() => selectLoadById(l.data.id)}>
              <td class="col-id">{l.data.id}</td>
              <td class="col-num">{l.data.elementId}</td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.a)} onclick={(e) => e.stopPropagation()} onchange={(e) => setNum(e.currentTarget, l.data.id, 'a', l.data.a)} /></td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.py ?? 0)} onclick={(e) => e.stopPropagation()} onchange={(e) => setNum(e.currentTarget, l.data.id, 'py', l.data.py ?? 0)} /></td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.pz ?? 0)} onclick={(e) => e.stopPropagation()} onchange={(e) => setNum(e.currentTarget, l.data.id, 'pz', l.data.pz ?? 0)} /></td>
              <td><button class="pro-delete-btn" onclick={(e) => { e.stopPropagation(); removeLoad(l.data.id); }}>×</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if surfaceLoads.length > 0}
      <div class="pro-load-section-title">{t('pro.surfaceLoads')}</div>
      <table class="pro-loads-table">
        <thead><tr><th>ID</th><th>{t('pro.slab')}</th><th>q (kN/m²)</th><th></th></tr></thead>
        <tbody>
          {#each surfaceLoads as l}
            <tr class:selected={isLoadSelected(l.data.id)} onclick={() => selectLoadById(l.data.id)}>
              <td class="col-id">{l.data.id}</td>
              <td class="col-num">{l.data.quadId}</td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.q)} onclick={(e) => e.stopPropagation()} onchange={(e) => setNum(e.currentTarget, l.data.id, 'q', l.data.q)} /></td>
              <td><button class="pro-delete-btn" onclick={(e) => { e.stopPropagation(); removeLoad(l.data.id); }}>×</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if thermalQuadLoads.length > 0}
      <div class="pro-load-section-title">{t('pro.thermalQuadLoads')}</div>
      <table class="pro-loads-table">
        <thead><tr><th>ID</th><th>{t('pro.slab')}</th><th>{t('pro.dtUniform')} (°C)</th><th>{t('pro.dtGradient')} (°C)</th><th></th></tr></thead>
        <tbody>
          {#each thermalQuadLoads as l}
            <tr class:selected={isLoadSelected(l.data.id)} onclick={() => selectLoadById(l.data.id)}>
              <td class="col-id">{l.data.id}</td>
              <td class="col-num">{l.data.quadId}</td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.dtUniform)} onclick={(e) => e.stopPropagation()} onchange={(e) => setNum(e.currentTarget, l.data.id, 'dtUniform', l.data.dtUniform)} /></td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.dtGradient)} onclick={(e) => e.stopPropagation()} onchange={(e) => setNum(e.currentTarget, l.data.id, 'dtGradient', l.data.dtGradient)} /></td>
              <td><button class="pro-delete-btn" onclick={(e) => { e.stopPropagation(); removeLoad(l.data.id); }}>×</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if caseLoads.length === 0}
      <div class="pro-empty">{t('pro.noLoads')}</div>
    {/if}
  </div>
</div>

<!-- LRFD Combination Generator Modal -->
{#if showComboModal}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="combo-modal-backdrop" onclick={() => showComboModal = false}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="combo-modal" onclick={(e) => e.stopPropagation()}>
      <div class="combo-modal-header">
        <h3>{activeTemplate === 'service' ? t('pro.generateService') : activeTemplate === 'project' ? t('combos.rules.generate') : t('pro.generateLRFD')}</h3>
        <span class="combo-modal-sub">{activeTemplate === 'service' ? t('pro.comboSubService') : activeTemplate === 'project' ? t('combos.rules.sub') : t('pro.comboSubStrength')}</span>
        <button class="combo-modal-close" onclick={() => showComboModal = false}>×</button>
      </div>
      {#if hasSeismicCases}
        <label class="combo-wind-basis" data-testid="combo-both-senses">
          <input type="checkbox" bind:checked={seismicBothSenses} onchange={() => { candidateCombos = buildCandidates(activeTemplate); }} />
          <span>{t('autoLoad.seismicBothSenses')}</span>
        </label>
      {/if}
      {#if hasWindCases}
        <label class="combo-wind-basis" data-testid="combo-wind-by-sign">
          <input type="checkbox" bind:checked={windBySign} onchange={() => { candidateCombos = buildCandidates(activeTemplate); }} />
          <span>{t('combos.windBySign')}</span>
        </label>
        <p class="combo-senses-hint">{t('combos.windBySignHint')}</p>
      {/if}
      <div class="combo-modal-body">
        {#each candidateCombos as cand, i}
          {@const nonZero = cand.factors.filter(f => Math.abs(f.factor) > 1e-9).sort((a, b) => {
            const typePri = (id: number) => {
              const lc2 = loadCases.find(c => c.id === id);
              const tp = (lc2?.type || '').toUpperCase();
              if (tp === 'D') return 0; if (tp === 'L') return 1; if (tp === 'LR') return 2;
              if (tp === 'S') return 3; if (tp === 'W') return 4; if (tp === 'E') return 5; return 6;
            };
            return typePri(a.caseId) - typePri(b.caseId) || a.caseId - b.caseId;
          })}
          <label class="combo-cand-row" class:combo-exists={cand.exists}>
            <input type="checkbox" bind:checked={candidateCombos[i].selected} />
            <span class="combo-cand-name">{cand.name}</span>
            <span class="combo-cand-factors">
              {#each nonZero as f}
                {@const lc3 = loadCases.find(c => c.id === f.caseId)}
                <span class="cand-factor-row"><span class="cand-f-val">{f.factor}</span> <span class="cand-f-type">{lc3?.type || '?'}</span> <span class="cand-f-name">{lc3?.name ?? f.caseId}</span></span>
              {/each}
            </span>
            {#if cand.exists}
              <span class="combo-exists-badge">{t('pro.comboAlreadyExists')}</span>
            {/if}
          </label>
        {/each}
      </div>
      <div class="combo-modal-footer">
        <span class="combo-modal-count">{candidateCombos.filter(c => c.selected).length} / {candidateCombos.length} {t('pro.selected')}</span>
        <button class="pro-btn" onclick={() => showComboModal = false}>{t('calcReport.cancel')}</button>
        <button class="pro-btn pro-btn-accent" onclick={applySelectedCombos} disabled={candidateCombos.filter(c => c.selected).length === 0}>{t('pro.generateSelected')}</button>
      </div>
    </div>
  </div>
{/if}

<style>


  /* ── The load-definition selector ──────────────────────────────────── */

  .load-tabs {
    display: flex;
    gap: 0.15rem;
    padding: 0.35rem 0 0.4rem;
    border-bottom: 1px solid var(--st-hair);
    margin-bottom: 0.5rem;
  }

  .load-tab {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    background: none;
    border: 1px solid transparent;
    border-radius: var(--st-radius);
    color: var(--st-text-3);
    font-family: var(--st-sans);
    font-size: 0.74rem;
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .load-tab:hover { background: var(--st-surface-3); color: var(--st-text); }
  .load-tab.on { color: var(--st-accent); border-color: var(--st-accent); }

  .load-tab-n { font-family: var(--st-mono); font-size: 0.62rem; color: var(--st-text-2); }
  .load-tab.on .load-tab-n { color: var(--st-accent); }

  .pro-loads { display: flex; flex-direction: column; }
  .pro-autogen-bar { padding: 8px 10px; border-bottom: 1px solid var(--st-surface-3); display: flex; align-items: center; gap: 8px; }
  /*
     The one command that starts a whole workflow, so it keeps its width — but
     as the shell's command, not a turquoise slab. Turquoise is what this
     palette uses for a computed value; a full-width block of it read as a
     result banner rather than as something you press.
  */
  .pro-btn-autogen {
    width: 100%; padding: 7px 12px; font-size: 0.75rem; font-weight: 500;
    color: var(--st-text-2); background: none;
    border: 1px solid var(--st-hair); border-radius: var(--st-radius);
    cursor: pointer; transition: background 0.12s, color 0.12s, border-color 0.12s;
  }
  .pro-btn-autogen:hover {
    background: var(--st-surface-3); color: var(--st-text); border-color: var(--st-hair-strong);
  }

  /* Load Cases */
  .pro-cases-section { border-bottom: 1px solid var(--st-surface-3); padding: 6px 10px; }
  .pro-section-content { padding: 6px 0 2px; }

  /* Combinations */
  .pro-combos-section { border-bottom: 1px solid var(--st-surface-3); padding: 6px 10px; }

  /* LRFD Generator Modal */
  .combo-modal-backdrop { position: fixed; inset: 0; z-index: 500; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; }
  .combo-modal { background: var(--st-surface); border: 1px solid var(--st-surface-3); border-radius: 10px; width: min(520px, calc(100vw - 40px)); max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 12px 40px rgba(0,0,0,0.5); }
  .combo-modal-header { padding: 14px 18px; border-bottom: 1px solid var(--st-surface-3); display: flex; align-items: center; gap: 10px; }
  .combo-modal-header h3 { font-size: 0.85rem; color: var(--st-text); font-weight: 700; margin: 0; }
  .combo-modal-sub { font-size: 0.62rem; color: var(--st-text-2); background: rgba(127, 212, 204,0.1); padding: 2px 6px; border-radius: 3px; }
  .combo-modal-close { margin-left: auto; background: none; border:  none; color: var(--st-text-3); font-size: 1.1rem; cursor: pointer; }
  .combo-modal-close:hover { color: var(--st-accent); }
  .combo-modal-body { flex: 1; overflow-y: auto; padding: 8px 12px; }
  .combo-cand-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 5px; cursor: pointer; font-size: 0.75rem; color: var(--st-text-2); transition: background 0.1s; }
  .combo-cand-row:hover { background: rgba(127, 212, 204,0.06); }
  .combo-cand-row.combo-exists { opacity: 0.5; }
  .combo-cand-row input[type="checkbox"] { accent-color: var(--st-text-2); cursor: pointer; }
  .combo-cand-name { font-weight: 600; min-width: 120px; color: var(--st-text); }
  .combo-cand-factors { font-size: 0.62rem; color: var(--st-text-3); flex: 1; display: flex; flex-direction: column; gap: 1px; }
  .cand-factor-row { display: flex; gap: 4px; align-items: baseline; }
  .cand-f-val { font-family: monospace; min-width: 28px; text-align: right; color: var(--st-text-2); }
  .cand-f-type { font-weight: 600; color: var(--st-text-3); min-width: 16px; }
  .cand-f-name { color: var(--st-text-3); }
  .combo-exists-badge { font-size: 0.58rem; color: var(--st-warn); background: rgba(217, 164, 65,0.1); padding: 1px 6px; border-radius: 3px; white-space: nowrap; }
  .combo-modal-footer { padding: 10px 18px; border-top: 1px solid var(--st-surface-3); display: flex; align-items: center; gap: 8px; }
  .combo-modal-count { flex: 1; font-size: 0.68rem; color: var(--st-text-3); }

  .pro-loads-header { padding: 8px 12px; border-bottom: 1px solid var(--st-surface-3); }
  .pro-loads-count { font-size: 0.78rem; color: var(--st-value); font-weight: 600; }

  .pro-addload-section { border-bottom: 1px solid var(--st-surface-3); }
  .pro-loads-form { padding: 6px 0 4px; }
  .pro-kind-row { display: flex; gap: 5px; margin-bottom: 10px; }
  .pro-type-btn {
    padding: 5px 10px; font-size: 0.75rem; font-weight: 500; color: var(--st-text-3);
    background: var(--st-surface-3); border: 1px solid var(--st-surface-3); border-radius: 4px; cursor: pointer;
  }
  .pro-type-btn:hover { color: var(--st-text-2); background: var(--st-hair-strong); }
  .pro-type-btn.active { color: var(--st-text); background: var(--st-surface-3); border-color: var(--st-text-2); }

  .pro-load-inputs { display: flex; flex-direction: column; gap: 8px; }
  .pro-load-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .pro-load-row label { font-size: 0.75rem; color: var(--st-text-3); display: flex; align-items: center; gap: 4px; }
  .inp-sm { width: 55px; padding: 4px 6px; background: var(--st-surface-3); border: 1px solid var(--st-surface-3); border-radius: 3px; color: var(--st-text); font-size: 0.78rem; font-family: monospace; }
  .inp-num { width: 65px; padding: 4px 6px; background: var(--st-surface-3); border: 1px solid var(--st-surface-3); border-radius: 3px; color: var(--st-text); font-size: 0.78rem; font-family: monospace; }
  .inp-sm:focus, .inp-num:focus { border-color: var(--st-surface-3); outline: none; }
  .pro-btn { align-self: flex-start; padding: 5px 14px; font-size: 0.75rem; color: var(--st-text-2); background: var(--st-surface-3); border: 1px solid var(--st-surface-3); border-radius: 4px; cursor: pointer; }
  .pro-btn:hover { background: var(--st-surface-3); color: var(--st-text); }
  .pro-load-target {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 4px;
    border-top: 1px solid var(--st-surface-3);
    margin-top: 4px;
  }
  .target-byid {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .target-byid label { font-size: 0.75rem; color: var(--st-text-3); display: flex; align-items: center; gap: 4px; }
  .target-sel {  }
  .pro-btn-sel { font-size: 0.72rem; color: var(--st-text-2); border-color: var(--st-hair-strong); background: var(--st-surface-3); padding: 5px 14px; border-radius: 4px; border: 1px solid var(--st-hair-strong); cursor: pointer; }
  .pro-btn-sel:hover { background: var(--st-hair-strong); color: var(--st-text); }
  .pro-btn-sel::before { content: '\2714\00a0'; }

  .pro-loads-table-wrap { }
  .pro-load-section-title { padding: 8px 12px 4px; font-size: 0.68rem; font-weight: 600; color: var(--st-text-2); text-transform: uppercase; letter-spacing: 0.04em; margin-top: 6px; }
  .pro-loads-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
  .pro-loads-table thead { position: sticky; top: 0; z-index: 1; }
  .pro-loads-table th { padding: 6px 6px; text-align: left; font-size: 0.68rem; font-weight: 600; color: var(--st-text-3); text-transform: uppercase; background: var(--st-surface); border-bottom: 1px solid var(--st-surface-3); }
  .pro-loads-table td { padding: 4px 6px; border-bottom: 1px solid var(--st-surface-2); color: var(--st-text-2); }
  .pro-loads-table tbody tr { cursor: pointer; transition: background 0.1s; }
  .pro-loads-table tbody tr:hover { background: rgba(127, 212, 204, 0.08); }
  .pro-loads-table tbody tr.selected { background: rgba(127, 212, 204, 0.18); box-shadow: inset 3px 0 0 var(--st-value); }
  .inp-cell {
    background: transparent; border: 1px solid transparent; border-radius: 3px;
    color: var(--st-text-2); font-size: 0.72rem; font-family: monospace; padding: 2px 4px;
    width: 60px; text-align: right;
  }
  .inp-cell:hover { border-color: var(--st-surface-3); }
  .inp-cell:focus { background: var(--st-surface-3); border-color: var(--st-surface-3); outline: none; }
  .col-id { width: 32px; color: var(--st-text-3); font-family: monospace; text-align: center; }
  .col-num { font-family: monospace; text-align: right; font-size: 0.75rem; }
  .pro-delete-btn { background: none; border:  none; color: var(--st-text-3); font-size: 1rem; cursor: pointer; padding: 0; }
  .pro-delete-btn:hover { color: var(--st-danger); }
  .pro-empty { text-align: center; color: var(--st-text-3); font-style: italic; padding: 30px 10px; font-size: 0.78rem; }
  .combo-senses-hint { margin: 0; padding: 0 12px 6px; font-size: 0.62rem; color: var(--st-text-3); }
  .combo-wind-basis { display: flex; gap: 6px; align-items: center; padding: 6px 12px; font-size: 0.68rem; color: var(--st-text-2); border-bottom: 1px solid var(--st-hair); }
</style>
