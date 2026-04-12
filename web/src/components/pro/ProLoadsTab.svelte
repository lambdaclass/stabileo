<script lang="ts">
  import { modelStore, uiStore, resultsStore } from '../../lib/store';
  import type { LoadCaseType } from '../../lib/store/model.svelte';
  import { t } from '../../lib/i18n';
  import ProAutoLoadsDialog from './ProAutoLoadsDialog.svelte';

  let showAutoLoadsDialog = $state(false);

  type LoadKind = 'nodal' | 'distributed' | 'point' | 'surface' | 'thermalQuad';

  let loadKind = $state<LoadKind>('nodal');
  let activeCaseId = $state(1); // default to first load case

  // Load visibility toggle per case
  function isCaseVisible(caseId: number): boolean {
    const vis = uiStore.visibleLoadCases3D;
    return vis === null || vis.includes(caseId);
  }

  function toggleCaseVisibility(caseId: number) {
    const current = uiStore.visibleLoadCases3D;
    if (current === null) {
      // Currently showing all → hide this one (show all except this)
      uiStore.visibleLoadCases3D = loadCases.map(lc => lc.id).filter(id => id !== caseId);
    } else {
      if (current.includes(caseId)) {
        const next = current.filter(id => id !== caseId);
        uiStore.visibleLoadCases3D = next;
      } else {
        const next = [...current, caseId];
        // If all cases are visible, reset to null (show all)
        uiStore.visibleLoadCases3D = next.length >= loadCases.length ? null : next;
      }
    }
    // Ensure loads are shown
    uiStore.showLoads3D = true;
  }

  function showAllCases() {
    uiStore.visibleLoadCases3D = null;
    uiStore.showLoads3D = true;
    uiStore.hideLoadsWithDiagram = false;
  }

  function hideAllCases() {
    uiStore.visibleLoadCases3D = [];
  }

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

  // New load case fields
  let newCaseName = $state('');
  let newCaseType = $state<LoadCaseType>('');

  // New combination fields
  let newComboName = $state('');

  const loads = $derived(modelStore.loads);
  const loadCases = $derived(modelStore.model.loadCases);
  const combinations = $derived(modelStore.model.combinations);

  // Filter loads by active case
  const caseLoads = $derived(loads.filter(l => (l.data.caseId ?? 1) === activeCaseId));
  const nodalLoads = $derived(caseLoads.filter(l => l.type === 'nodal3d'));
  const distLoads = $derived(caseLoads.filter(l => l.type === 'distributed3d'));
  const pointLoads = $derived(caseLoads.filter(l => l.type === 'pointOnElement3d'));
  const surfaceLoads = $derived(caseLoads.filter(l => l.type === 'surface3d'));
  const thermalQuadLoads = $derived(caseLoads.filter(l => l.type === 'thermalQuad3d'));

  /** Select all loads belonging to a given load case in the viewport. */
  function selectLoadsByCase(caseId: number) {
    uiStore.selectMode = 'loads';
    uiStore.clearSelection();
    for (let i = 0; i < modelStore.loads.length; i++) {
      if ((modelStore.loads[i].data.caseId ?? 1) === caseId) {
        uiStore.selectLoad(i, true);
      }
    }
  }

  /** Select a load in the viewport by its data.id (finds the array index in modelStore.loads). */
  function selectLoadById(dataId: number) {
    const idx = modelStore.loads.findIndex(l => l.data.id === dataId);
    if (idx >= 0) {
      uiStore.selectMode = 'loads';
      uiStore.selectLoad(idx, false);
    }
  }

  /** Check if a load is currently selected by its data.id. */
  function isLoadSelected(dataId: number): boolean {
    const idx = modelStore.loads.findIndex(l => l.data.id === dataId);
    return idx >= 0 && uiStore.selectedLoads.has(idx);
  }

  const caseTypeLabels = $derived<Record<string, string>>({
    'D': t('pro.caseTypeD'),
    'L': t('pro.caseTypeL'),
    'W': t('pro.caseTypeW'),
    'E': t('pro.caseTypeE'),
    'S': t('pro.caseTypeS'),
    'T': t('pro.caseTypeT'),
    '': t('pro.caseTypeOther'),
  });

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
    modelStore.addNodalLoad3D(nodeId, fx, fy, fz, mx, my, mz, activeCaseId);
    nlNodeId = ''; nlFx = ''; nlFy = ''; nlFz = ''; nlMx = ''; nlMy = ''; nlMz = '';
  }

  function addDistLoad() {
    const elemId = parseInt(dlElemId);
    if (isNaN(elemId) || !modelStore.elements.has(elemId)) return;
    const qyI = parseFloat(dlQyI) || 0;
    const qyJ = parseFloat(dlQyJ) || qyI;
    const qzI = parseFloat(dlQzI) || 0;
    const qzJ = parseFloat(dlQzJ) || qzI;
    if (qyI === 0 && qyJ === 0 && qzI === 0 && qzJ === 0) return;
    modelStore.addDistributedLoad3D(elemId, qyI, qyJ, qzI, qzJ, undefined, undefined, activeCaseId);
    dlElemId = ''; dlQyI = ''; dlQyJ = ''; dlQzI = ''; dlQzJ = '';
  }

  function addPointLoad() {
    const elemId = parseInt(plElemId);
    if (isNaN(elemId) || !modelStore.elements.has(elemId)) return;
    const a = parseFloat(plA);
    const py = parseFloat(plPy) || 0;
    const pz = parseFloat(plPz) || 0;
    if (isNaN(a) || a < 0 || (py === 0 && pz === 0)) return;
    modelStore.addPointLoadOnElement3D(elemId, a, py, pz, activeCaseId);
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
    modelStore.addSurfaceLoad3D(quadId, q, activeCaseId);
    slQuadId = ''; slQ = '';
  }

  function addThermalQuadLoad() {
    const quadId = parseInt(tqQuadId);
    if (isNaN(quadId) || !modelStore.model.quads.has(quadId)) return;
    const dtU = parseFloat(tqDtUniform) || 0;
    const dtG = parseFloat(tqDtGradient) || 0;
    if (dtU === 0 && dtG === 0) return;
    modelStore.addThermalLoadQuad3D(quadId, dtU, dtG, activeCaseId);
    tqQuadId = ''; tqDtUniform = ''; tqDtGradient = '';
  }

  function addNodalLoadToSelection() {
    const fx = parseFloat(nlFx) || 0, fy = parseFloat(nlFy) || 0, fz = parseFloat(nlFz) || 0;
    const mx = parseFloat(nlMx) || 0, my = parseFloat(nlMy) || 0, mz = parseFloat(nlMz) || 0;
    if (fx === 0 && fy === 0 && fz === 0 && mx === 0 && my === 0 && mz === 0) return;
    for (const nodeId of uiStore.selectedNodes) {
      if (modelStore.nodes.has(nodeId)) modelStore.addNodalLoad3D(nodeId, fx, fy, fz, mx, my, mz, activeCaseId);
    }
    nlFx = ''; nlFy = ''; nlFz = ''; nlMx = ''; nlMy = ''; nlMz = '';
  }

  function addDistLoadToSelection() {
    const qyI = parseFloat(dlQyI) || 0, qyJ = parseFloat(dlQyJ) || qyI;
    const qzI = parseFloat(dlQzI) || 0, qzJ = parseFloat(dlQzJ) || qzI;
    if (qyI === 0 && qyJ === 0 && qzI === 0 && qzJ === 0) return;
    for (const elemId of uiStore.selectedElements) {
      if (modelStore.elements.has(elemId)) modelStore.addDistributedLoad3D(elemId, qyI, qyJ, qzI, qzJ, undefined, undefined, activeCaseId);
    }
    dlQyI = ''; dlQyJ = ''; dlQzI = ''; dlQzJ = '';
  }

  function addPointLoadToSelection() {
    const a = parseFloat(plA), py = parseFloat(plPy) || 0, pz = parseFloat(plPz) || 0;
    if (isNaN(a) || a < 0 || (py === 0 && pz === 0)) return;
    for (const elemId of uiStore.selectedElements) {
      if (modelStore.elements.has(elemId)) modelStore.addPointLoadOnElement3D(elemId, a, py, pz, activeCaseId);
    }
    plA = ''; plPy = ''; plPz = '';
  }

  function removeLoad(loadId: number) {
    modelStore.removeLoad(loadId);
  }

  function addLoadCase() {
    if (!newCaseName.trim()) return;
    const id = modelStore.addLoadCase(newCaseName.trim(), newCaseType);
    activeCaseId = id;
    newCaseName = '';
    newCaseType = '';
  }

  function removeLoadCase(id: number) {
    modelStore.removeLoadCase(id);
    if (activeCaseId === id) {
      activeCaseId = loadCases[0]?.id ?? 1;
    }
  }

  function addCombination() {
    if (!newComboName.trim()) return;
    // Default: all cases ×1.0
    const factors = loadCases.map(lc => ({ caseId: lc.id, factor: 1.0 }));
    modelStore.addCombination(newComboName.trim(), factors);
    newComboName = '';
  }

  // ─── Combination Generator with Review Modal ──────────

  type ComboTemplate = 'lrfd' | 'service';

  interface CandidateCombo {
    name: string;
    factors: Array<{caseId: number; factor: number}>;
    exists: boolean;
    selected: boolean;
    template: ComboTemplate;
  }

  let showComboModal = $state(false);
  let candidateCombos = $state<CandidateCombo[]>([]);
  let activeTemplate = $state<ComboTemplate>('lrfd');

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
    if (template === 'service') return buildServiceCandidates();
    return buildLRFDCandidates();
  }

  /** Build service/ASD combination candidates (ASCE 7-22 §2.4). */
  function buildServiceCandidates(): CandidateCombo[] {
    const cases = modelStore.model.loadCases;
    const byType: Record<string, number[]> = {};
    for (const lc of cases) { const t2 = (lc.type || '').toUpperCase(); if (!byType[t2]) byType[t2] = []; byType[t2].push(lc.id); }
    const D = byType['D'] ?? [], L = byType['L'] ?? [], Lr = byType['LR'] ?? [];
    const S2 = byType['S'] ?? [], W = byType['W'] ?? [], E2 = byType['E'] ?? [];
    function mkF(pairs: Array<[number, number]>): Array<{caseId: number; factor: number}> {
      return cases.map(lc => { const m = pairs.find(([id]) => id === lc.id); return { caseId: lc.id, factor: m ? m[1] : 0 }; });
    }
    function mk(name: string, pairs: Array<[number, number]>): CandidateCombo {
      const factors = mkF(pairs); return { name, factors, exists: comboExists(factors), selected: false, template: 'service' };
    }
    const out: CandidateCombo[] = [];
    if (D.length === 0) return out;
    // S1: D
    out.push(mk('D', D.map(id => [id, 1.0])));
    // S2: D + L
    if (L.length > 0) out.push(mk('D + L', [...D.map(id => [id, 1.0] as [number, number]), ...L.map(id => [id, 1.0] as [number, number])]));
    // S3: D + Lr (or S)
    if (Lr.length > 0) out.push(mk('D + Lr', [...D.map(id => [id, 1.0] as [number, number]), ...Lr.map(id => [id, 1.0] as [number, number])]));
    else if (S2.length > 0) out.push(mk('D + S', [...D.map(id => [id, 1.0] as [number, number]), ...S2.map(id => [id, 1.0] as [number, number])]));
    // S4: D + 0.75L + 0.75Lr (or S)
    if (L.length > 0 && (Lr.length > 0 || S2.length > 0)) {
      const pairs: Array<[number, number]> = [...D.map(id => [id, 1.0] as [number, number]), ...L.map(id => [id, 0.75] as [number, number])];
      if (Lr.length > 0) pairs.push(...Lr.map(id => [id, 0.75] as [number, number]));
      else pairs.push(...S2.map(id => [id, 0.75] as [number, number]));
      out.push(mk('D + 0.75L + 0.75' + (Lr.length > 0 ? 'Lr' : 'S'), pairs));
    }
    // S5: D + W (per wind direction)
    for (const wId of W) {
      const sn = (cases.find(c => c.id === wId)?.name ?? '') || `W${wId}`;
      out.push(mk(`D + ${sn}`, [...D.map(id => [id, 1.0] as [number, number]), [wId, 1.0]]));
    }
    // S6: D + 0.7E (per seismic direction)
    for (const eId of E2) {
      const sn = (cases.find(c => c.id === eId)?.name ?? '') || `E${eId}`;
      out.push(mk(`D + 0.7${sn}`, [...D.map(id => [id, 1.0] as [number, number]), [eId, 0.7]]));
    }
    // S7: D + 0.75L + 0.75W (per wind direction)
    for (const wId of W) {
      const sn = (cases.find(c => c.id === wId)?.name ?? '') || `W${wId}`;
      const pairs: Array<[number, number]> = [...D.map(id => [id, 1.0] as [number, number])];
      if (L.length > 0) pairs.push(...L.map(id => [id, 0.75] as [number, number]));
      pairs.push([wId, 0.75]);
      out.push(mk(`D + 0.75L + 0.75${sn}`, pairs));
    }
    // S8: 0.6D + W (per wind direction)
    for (const wId of W) {
      const sn = (cases.find(c => c.id === wId)?.name ?? '') || `W${wId}`;
      out.push(mk(`0.6D + ${sn}`, [...D.map(id => [id, 0.6] as [number, number]), [wId, 1.0]]));
    }
    // S9: 0.6D + 0.7E (per seismic direction)
    for (const eId of E2) {
      const sn = (cases.find(c => c.id === eId)?.name ?? '') || `E${eId}`;
      out.push(mk(`0.6D + 0.7${sn}`, [...D.map(id => [id, 0.6] as [number, number]), [eId, 0.7]]));
    }
    for (const c of out) c.selected = !c.exists;
    return out;
  }

  /** Build LRFD ultimate combination candidates (ASCE 7-22 §2.3). */
  function buildLRFDCandidates(): CandidateCombo[] {
    const cases = modelStore.model.loadCases;
    const byType: Record<string, number[]> = {};
    for (const lc of cases) {
      const t2 = (lc.type || '').toUpperCase();
      if (!byType[t2]) byType[t2] = [];
      byType[t2].push(lc.id);
    }
    const D = byType['D'] ?? [], L = byType['L'] ?? [], Lr = byType['LR'] ?? [];
    const S2 = byType['S'] ?? [], W = byType['W'] ?? [], E2 = byType['E'] ?? [];

    function mkFactors(pairs: Array<[number, number]>): Array<{caseId: number; factor: number}> {
      return cases.map(lc => {
        const match = pairs.find(([id]) => id === lc.id);
        return { caseId: lc.id, factor: match ? match[1] : 0 };
      });
    }
    function mk(name: string, pairs: Array<[number, number]>): CandidateCombo {
      const factors = mkFactors(pairs);
      return { name, factors, exists: comboExists(factors), selected: false, template: 'lrfd' as ComboTemplate };
    }

    const out: CandidateCombo[] = [];
    if (D.length === 0) return out;

    // 1. 1.4D
    out.push(mk('1.4D', D.map(id => [id, 1.4])));

    // 2. 1.2D + 1.6L + 0.5(Lr or S)
    if (L.length > 0) {
      const base: Array<[number, number]> = [...D.map(id => [id, 1.2] as [number, number]), ...L.map(id => [id, 1.6] as [number, number])];
      if (Lr.length > 0) out.push(mk('1.2D + 1.6L + 0.5Lr', [...base, ...Lr.map(id => [id, 0.5] as [number, number])]));
      else if (S2.length > 0) out.push(mk('1.2D + 1.6L + 0.5S', [...base, ...S2.map(id => [id, 0.5] as [number, number])]));
      else out.push(mk('1.2D + 1.6L', base));
    }

    // 3. 1.2D + 1.6(Lr or S) + L
    if (Lr.length > 0) {
      const base: Array<[number, number]> = [...D.map(id => [id, 1.2] as [number, number]), ...Lr.map(id => [id, 1.6] as [number, number])];
      out.push(mk(L.length > 0 ? '1.2D + 1.6Lr + L' : '1.2D + 1.6Lr', L.length > 0 ? [...base, ...L.map(id => [id, 1.0] as [number, number])] : base));
    } else if (S2.length > 0) {
      const base: Array<[number, number]> = [...D.map(id => [id, 1.2] as [number, number]), ...S2.map(id => [id, 1.6] as [number, number])];
      out.push(mk(L.length > 0 ? '1.2D + 1.6S + L' : '1.2D + 1.6S', L.length > 0 ? [...base, ...L.map(id => [id, 1.0] as [number, number])] : base));
    }

    // 4. 1.2D + L + 1.6W (per wind direction)
    for (const wId of W) {
      const sn = (cases.find(c => c.id === wId)?.name ?? '').replace(/^W\s*[—–-]\s*/, '') || `W${wId}`;
      const pairs: Array<[number, number]> = [...D.map(id => [id, 1.2] as [number, number])];
      if (L.length > 0) pairs.push(...L.map(id => [id, 1.0] as [number, number]));
      pairs.push([wId, 1.6]);
      out.push(mk(`1.2D + L + 1.6${sn}`, pairs));
    }
    // 5. 1.2D + L + E (per seismic direction)
    for (const eId of E2) {
      const sn = (cases.find(c => c.id === eId)?.name ?? '').replace(/^E\s*[—–-]\s*/, '') || `E${eId}`;
      const pairs: Array<[number, number]> = [...D.map(id => [id, 1.2] as [number, number])];
      if (L.length > 0) pairs.push(...L.map(id => [id, 1.0] as [number, number]));
      pairs.push([eId, 1.0]);
      out.push(mk(`1.2D + L + ${sn}`, pairs));
    }
    // 6. 0.9D + 1.6W (per wind direction)
    for (const wId of W) {
      const sn = (cases.find(c => c.id === wId)?.name ?? '').replace(/^W\s*[—–-]\s*/, '') || `W${wId}`;
      out.push(mk(`0.9D + 1.6${sn}`, [...D.map(id => [id, 0.9] as [number, number]), [wId, 1.6]]));
    }
    // 7. 0.9D + E (per seismic direction)
    for (const eId of E2) {
      const sn = (cases.find(c => c.id === eId)?.name ?? '').replace(/^E\s*[—–-]\s*/, '') || `E${eId}`;
      out.push(mk(`0.9D + ${sn}`, [...D.map(id => [id, 0.9] as [number, number]), [eId, 1.0]]));
    }

    // Default selection: check only those that don't already exist
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
    const prefix = activeTemplate === 'service' ? 'S' : 'U';
    // Count only combos with matching prefix for independent numbering
    const pattern = new RegExp(`^${prefix}\\d+:`);
    let n = combinations.filter(c => pattern.test(c.name)).length;
    modelStore.batch(() => {
      for (const c of toAdd) {
        n++;
        modelStore.addCombination(`${prefix}${n}: ${c.name}`, c.factors);
      }
    });
    showComboModal = false;
    const label = activeTemplate === 'service' ? t('pro.serviceCombosGenerated') : t('pro.combosGenerated');
    uiStore.toast(`${toAdd.length} ${label}`, 'success');
  }

  function removeCombination(id: number) {
    modelStore.removeCombination(id);
  }

  function updateComboFactor(comboId: number, caseId: number, value: string) {
    const f = parseFloat(value);
    if (isNaN(f)) return;
    const combo = combinations.find(c => c.id === comboId);
    if (!combo) return;
    const existing = combo.factors.find(ff => ff.caseId === caseId);
    if (existing) {
      existing.factor = f;
    } else {
      combo.factors.push({ caseId, factor: f });
    }
    // Trigger reactivity
    modelStore.updateCombination(comboId, { name: combo.name, factors: combo.factors });
  }

  function fmtNum(n: number): string {
    if (n === 0) return '0';
    return n.toFixed(2);
  }
</script>

<div class="pro-loads">
  <!-- Auto-generate button -->
  <div class="pro-autogen-bar">
    <button class="pro-btn-autogen" onclick={() => showAutoLoadsDialog = true}>{t('autoLoad.autoGenBtn')}</button>
  </div>

  <ProAutoLoadsDialog open={showAutoLoadsDialog} onclose={() => showAutoLoadsDialog = false} />

  <!-- Load Cases Management (collapsible) -->
  <div class="pro-cases-section">
    <details open>
      <summary class="pro-section-label">{t('pro.loadCases')} ({loadCases.length})</summary>
    <div class="pro-section-content">
    <!-- Load visibility controls -->
    <div class="pro-vis-bar">
      <label class="pro-vis-toggle">
        <input type="checkbox" checked={uiStore.showLoads3D} onchange={(e) => { uiStore.showLoads3D = e.currentTarget.checked; if (e.currentTarget.checked) uiStore.hideLoadsWithDiagram = false; }} />
        {t('pro.showLoads')}
      </label>
      {#if !uiStore.showLoads3D}
        <span class="pro-vis-status pro-vis-off">{t('pro.visOff')}</span>
      {:else if uiStore.hideLoadsWithDiagram && resultsStore.diagramType !== 'none'}
        <button class="pro-vis-btn pro-vis-btn-warn" onclick={() => { uiStore.hideLoadsWithDiagram = false; uiStore.showLoads3D = true; }}>
          {t('pro.loadsHiddenByDiagram')}
        </button>
      {:else}
        <span class="pro-vis-status pro-vis-on">{loads.length} {t('pro.tabLoads').toLowerCase()}</span>
      {/if}
      <button class="pro-vis-btn" onclick={showAllCases} title={t('pro.showAll')}>{t('pro.showAll')}</button>
      <button class="pro-vis-btn" onclick={hideAllCases} title={t('pro.hideAll')}>{t('pro.hideAll')}</button>
    </div>
    <table class="pro-lc-table">
      <thead><tr><th></th><th>{t('pro.lcType')}</th><th>{t('pro.lcName')}</th><th>{t('pro.lcLoads')}</th><th></th><th></th></tr></thead>
      <tbody>
        <tr class="sw-row" class:sw-active={uiStore.includeSelfWeight}>
          <td><input type="checkbox" class="sw-check" bind:checked={uiStore.includeSelfWeight} /></td>
          <td class="lc-type">D</td>
          <td class="lc-name">{t('pro.selfWeight')} <span class="sw-auto-badge">{uiStore.includeSelfWeight ? t('pro.swOn') : t('pro.swOff')}</span></td>
          <td class="lc-count">—</td>
          <td></td>
          <td></td>
        </tr>
        {#each loadCases as lc}
          {@const caseLoadCount = loads.filter(l => (l.data.caseId ?? 1) === lc.id).length}
          <tr class:active={activeCaseId === lc.id} onclick={() => { activeCaseId = lc.id; selectLoadsByCase(lc.id); }} style="cursor:pointer">
            <td><span class="case-type-dot" class:type-d={lc.type === 'D'} class:type-l={lc.type === 'L'} class:type-lr={lc.type === 'Lr'} class:type-w={lc.type === 'W'} class:type-e={lc.type === 'E'}></span></td>
            <td class="lc-type"><select class="lc-type-select" value={lc.type} onclick={(e) => e.stopPropagation()} onchange={(e) => modelStore.updateLoadCaseType(lc.id, e.currentTarget.value)}><option value="D">D</option><option value="L">L</option><option value="Lr">Lr</option><option value="W">W</option><option value="E">E</option><option value="S">S</option><option value="">—</option></select></td>
            <td class="lc-name"><input class="lc-name-input" type="text" value={lc.name} onclick={(e) => e.stopPropagation()} onchange={(e) => modelStore.updateLoadCase(lc.id, e.currentTarget.value)} /></td>
            <td class="lc-count">{caseLoadCount}</td>
            <td class="lc-vis"><button class="lc-vis-btn" class:visible={isCaseVisible(lc.id)} class:hidden-case={!isCaseVisible(lc.id)} onclick={(e) => { e.stopPropagation(); toggleCaseVisibility(lc.id); }} title={isCaseVisible(lc.id) ? t('pro.hideCase') : t('pro.showCase')}>👁</button></td>
            <td class="lc-del">{#if loadCases.length > 1}<button class="pro-delete-btn" onclick={(e) => { e.stopPropagation(); removeLoadCase(lc.id); }}>×</button>{/if}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <div class="pro-case-add">
      <input type="text" bind:value={newCaseName} placeholder={t('pro.newCase')} class="inp-case" />
      <select bind:value={newCaseType} class="pro-sel-sm">
        <option value="D">D</option>
        <option value="L">L</option>
        <option value="Lr">Lr</option>
        <option value="W">W</option>
        <option value="E">E</option>
        <option value="S">S</option>
        <option value="">{t('pro.caseTypeOther')}</option>
      </select>
      <button class="pro-btn-sm" onclick={addLoadCase}>+</button>
    </div>
    </div>
    </details>
  </div>

  <!-- Combinations -->
  <div class="pro-combos-section">
    <details>
      <summary class="pro-section-label">{t('pro.combos')} ({combinations.length})</summary>
      <div class="pro-combos-list">
        {#each combinations as combo}
          <div class="pro-combo-card">
            <div class="combo-header">
              <span class="combo-name">{combo.name}</span>
              {#if /^U\d+:/.test(combo.name)}
                <span class="combo-prov-badge combo-prov-lrfd">LRFD</span>
              {:else if /^S\d+:/.test(combo.name)}
                <span class="combo-prov-badge combo-prov-svc">SVC</span>
              {/if}
              <button class="pro-delete-btn" onclick={() => removeCombination(combo.id)}>×</button>
            </div>
            <table class="combo-factor-table">
              {#if uiStore.includeSelfWeight}
                {@const swFactor = (() => {
                  const deadCase = loadCases.find(c => c.type === 'D');
                  return deadCase ? (combo.factors.find(f => f.caseId === deadCase.id)?.factor ?? 0) : 0;
                })()}
                <tr class="sw-factor-row">
                  <td class="combo-factor-val"><span class="sw-factor-display">{swFactor}</span></td>
                  <td class="combo-factor-mult">×</td>
                  <td class="combo-factor-name">D — {t('pro.selfWeight')} <span class="sw-auto-badge">{t('pro.swAuto')}</span></td>
                </tr>
              {/if}
              {#each loadCases as lc}
                {@const factor = combo.factors.find(f => f.caseId === lc.id)?.factor ?? 0}
                <tr>
                  <td class="combo-factor-val"><input type="text" value={factor} class="inp-factor" onchange={(e) => updateComboFactor(combo.id, lc.id, e.currentTarget.value)} /></td>
                  <td class="combo-factor-mult">×</td>
                  <td class="combo-factor-name">{lc.name}</td>
                </tr>
              {/each}
            </table>
          </div>
        {/each}
        <div class="pro-combo-add">
          <input type="text" bind:value={newComboName} placeholder={t('pro.comboPlaceholder')} class="inp-case" />
          <button class="pro-btn-sm" onclick={addCombination}>{t('pro.addCombo')}</button>
        </div>
        <div class="pro-combo-generate">
          <button class="pro-btn pro-btn-accent" onclick={() => openComboGenerator('lrfd')} title={t('pro.generateLRFDHint')}>
            {t('pro.generateLRFD')}
          </button>
          <button class="pro-btn" onclick={() => openComboGenerator('service')} title={t('pro.generateServiceHint')}>
            {t('pro.generateService')}
          </button>
        </div>
      </div>
    </details>
  </div>

  <!-- Add Load (collapsible) -->
  <div class="pro-addload-section">
    <details open>
      <summary class="pro-section-label">{t('pro.addLoad')} ({caseLoads.length} {t('pro.inCase')} {loadCases.find(c => c.id === activeCaseId)?.name ?? '?'})</summary>
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
          {/if}
        </div>
      </div>
    {:else if loadKind === 'distributed'}
      <div class="pro-load-inputs">
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
              <button class="pro-btn pro-btn-sel" onclick={addDistLoadToSelection}>{uiStore.selectedElements.size} selected elements</button>
            </div>
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
              <button class="pro-btn pro-btn-sel" onclick={addPointLoadToSelection}>{uiStore.selectedElements.size} selected elements</button>
            </div>
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
    </details>
  </div>

  <!-- Loads table for active case -->
  <div class="pro-loads-table-wrap">
    {#if nodalLoads.length > 0}
      <div class="pro-load-section-title">{t('pro.nodalLoads')}</div>
      <table class="pro-loads-table">
        <thead><tr><th>ID</th><th>Nodo</th><th>Fx</th><th>Fy</th><th>Fz</th><th>Mx</th><th>My</th><th>Mz</th><th></th></tr></thead>
        <tbody>
          {#each nodalLoads as l}
            <tr class:selected={isLoadSelected(l.data.id)} onclick={() => selectLoadById(l.data.id)}>
              <td class="col-id">{l.data.id}</td>
              <td class="col-num">{l.data.nodeId}</td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.fx)} onclick={(e) => e.stopPropagation()} onchange={(e) => modelStore.updateLoad(l.data.id, { fx: parseFloat(e.currentTarget.value) || 0 })} /></td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.fy)} onclick={(e) => e.stopPropagation()} onchange={(e) => modelStore.updateLoad(l.data.id, { fy: parseFloat(e.currentTarget.value) || 0 })} /></td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.fz ?? 0)} onclick={(e) => e.stopPropagation()} onchange={(e) => modelStore.updateLoad(l.data.id, { fz: parseFloat(e.currentTarget.value) || 0 })} /></td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.mx ?? 0)} onclick={(e) => e.stopPropagation()} onchange={(e) => modelStore.updateLoad(l.data.id, { mx: parseFloat(e.currentTarget.value) || 0 })} /></td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.my ?? 0)} onclick={(e) => e.stopPropagation()} onchange={(e) => modelStore.updateLoad(l.data.id, { my: parseFloat(e.currentTarget.value) || 0 })} /></td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.mz ?? 0)} onclick={(e) => e.stopPropagation()} onchange={(e) => modelStore.updateLoad(l.data.id, { mz: parseFloat(e.currentTarget.value) || 0 })} /></td>
              <td><button class="pro-delete-btn" onclick={() => removeLoad(l.data.id)}>×</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if distLoads.length > 0}
      <div class="pro-load-section-title">{t('pro.distLoads')}</div>
      <table class="pro-loads-table">
        <thead><tr><th>ID</th><th>Elem</th><th>qY_i</th><th>qY_j</th><th>qZ_i</th><th>qZ_j</th><th></th></tr></thead>
        <tbody>
          {#each distLoads as l}
            <tr class:selected={isLoadSelected(l.data.id)} onclick={() => selectLoadById(l.data.id)}>
              <td class="col-id">{l.data.id}</td>
              <td class="col-num">{l.data.elementId}</td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.qYI ?? 0)} onclick={(e) => e.stopPropagation()} onchange={(e) => modelStore.updateLoad(l.data.id, { qYI: parseFloat(e.currentTarget.value) || 0 })} /></td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.qYJ ?? 0)} onclick={(e) => e.stopPropagation()} onchange={(e) => modelStore.updateLoad(l.data.id, { qYJ: parseFloat(e.currentTarget.value) || 0 })} /></td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.qZI ?? 0)} onclick={(e) => e.stopPropagation()} onchange={(e) => modelStore.updateLoad(l.data.id, { qZI: parseFloat(e.currentTarget.value) || 0 })} /></td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.qZJ ?? 0)} onclick={(e) => e.stopPropagation()} onchange={(e) => modelStore.updateLoad(l.data.id, { qZJ: parseFloat(e.currentTarget.value) || 0 })} /></td>
              <td><button class="pro-delete-btn" onclick={() => removeLoad(l.data.id)}>×</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if pointLoads.length > 0}
      <div class="pro-load-section-title">{t('pro.pointLoads')}</div>
      <table class="pro-loads-table">
        <thead><tr><th>ID</th><th>Elem</th><th>a (m)</th><th>Py</th><th>Pz</th><th></th></tr></thead>
        <tbody>
          {#each pointLoads as l}
            <tr class:selected={isLoadSelected(l.data.id)} onclick={() => selectLoadById(l.data.id)}>
              <td class="col-id">{l.data.id}</td>
              <td class="col-num">{l.data.elementId}</td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.a)} onclick={(e) => e.stopPropagation()} onchange={(e) => modelStore.updateLoad(l.data.id, { a: parseFloat(e.currentTarget.value) || 0 })} /></td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.py ?? 0)} onclick={(e) => e.stopPropagation()} onchange={(e) => modelStore.updateLoad(l.data.id, { py: parseFloat(e.currentTarget.value) || 0 })} /></td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.pz ?? 0)} onclick={(e) => e.stopPropagation()} onchange={(e) => modelStore.updateLoad(l.data.id, { pz: parseFloat(e.currentTarget.value) || 0 })} /></td>
              <td><button class="pro-delete-btn" onclick={() => removeLoad(l.data.id)}>×</button></td>
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
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.q)} onclick={(e) => e.stopPropagation()} onchange={(e) => modelStore.updateLoad(l.data.id, { q: parseFloat(e.currentTarget.value) || 0 })} /></td>
              <td><button class="pro-delete-btn" onclick={() => removeLoad(l.data.id)}>×</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if thermalQuadLoads.length > 0}
      <div class="pro-load-section-title">{t('pro.thermalQuadLoads')}</div>
      <table class="pro-loads-table">
        <thead><tr><th>ID</th><th>{t('pro.slab')}</th><th>{t('pro.dtUniform')}</th><th>{t('pro.dtGradient')}</th><th></th></tr></thead>
        <tbody>
          {#each thermalQuadLoads as l}
            <tr class:selected={isLoadSelected(l.data.id)} onclick={() => selectLoadById(l.data.id)}>
              <td class="col-id">{l.data.id}</td>
              <td class="col-num">{l.data.quadId}</td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.dtUniform)} onclick={(e) => e.stopPropagation()} onchange={(e) => modelStore.updateLoad(l.data.id, { dtUniform: parseFloat(e.currentTarget.value) || 0 })} /></td>
              <td class="col-num"><input class="inp-cell" value={fmtNum(l.data.dtGradient)} onclick={(e) => e.stopPropagation()} onchange={(e) => modelStore.updateLoad(l.data.id, { dtGradient: parseFloat(e.currentTarget.value) || 0 })} /></td>
              <td><button class="pro-delete-btn" onclick={() => removeLoad(l.data.id)}>×</button></td>
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
        <h3>{activeTemplate === 'service' ? t('pro.generateService') : t('pro.generateLRFD')}</h3>
        <span class="combo-modal-sub">{activeTemplate === 'service' ? 'ASCE 7 §2.4 / CIRSOC 101 ASD' : 'ASCE 7 §2.3 / CIRSOC 101 LRFD'}</span>
        <button class="combo-modal-close" onclick={() => showComboModal = false}>×</button>
      </div>
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
  .pro-loads { display: flex; flex-direction: column; }
  .pro-sw-bar {
    display: flex; align-items: center; padding: 6px 10px;
    border-bottom: 1px solid #1a3050; background: #0d2238;
  }
  .pro-sw-toggle {
    display: flex; align-items: center; gap: 6px;
    font-size: 0.75rem; color: #ccc; cursor: pointer; font-weight: 500;
  }
  .pro-sw-toggle input { accent-color: #4ecdc4; cursor: pointer; }
  .pro-vis-bar {
    display: flex; align-items: center; gap: 8px; padding: 6px 10px;
    border-bottom: 1px solid #1a3050; background: #0a1a30;
  }
  .pro-vis-toggle {
    display: flex; align-items: center; gap: 4px;
    font-size: 0.72rem; color: #aaa; cursor: pointer; margin-right: auto;
  }
  .pro-vis-toggle input { accent-color: #4ecdc4; cursor: pointer; }
  .pro-vis-btn {
    padding: 2px 8px; font-size: 0.65rem; color: #888;
    background: transparent; border: 1px solid #1a3050; border-radius: 3px; cursor: pointer;
  }
  .pro-vis-btn:hover { color: #ccc; border-color: #4ecdc4; }
  .pro-vis-status { font-size: 0.62rem; font-weight: 600; }
  .pro-vis-on { color: #4ecdc4; }
  .pro-vis-off { color: #e94560; }
  .pro-vis-btn-warn {
    color: #f0a500; border-color: #5a4a2a; font-weight: 600;
    animation: pulse-warn 1.5s ease-in-out infinite;
  }
  @keyframes pulse-warn { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
  .pro-autogen-bar { padding: 8px 10px; border-bottom: 1px solid #1a3050; }
  .pro-btn-autogen {
    width: 100%; padding: 7px 12px; font-size: 0.75rem; font-weight: 600;
    color: #1a1a2e; background: #4ecdc4; border: none; border-radius: 5px;
    cursor: pointer; transition: background 0.15s;
  }
  .pro-btn-autogen:hover { background: #3dbdb4; }

  /* Load Cases */
  .pro-cases-section { border-bottom: 1px solid #1a3050; padding: 6px 10px; }
  .pro-section-label { font-size: 0.78rem; color: #4ecdc4; font-weight: 600; cursor: pointer; padding: 2px 0; }
  .pro-section-content { padding: 6px 0 2px; }

  /* Load case table */
  .pro-lc-table { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
  .pro-lc-table th { padding: 4px 6px; font-size: 0.62rem; font-weight: 600; color: #556; text-transform: uppercase; text-align: left; border-bottom: 1px solid #1a3050; }
  .pro-lc-table td { padding: 4px 6px; border-bottom: 1px solid #0f2030; }
  .pro-lc-table tbody tr { cursor: pointer; transition: background 0.1s; }
  .pro-lc-table tbody tr:hover { background: rgba(78, 205, 196, 0.08); }
  .pro-lc-table tbody tr.active { background: rgba(78, 205, 196, 0.18); box-shadow: inset 3px 0 0 #4ecdc4; }
  .pro-lc-table .sw-row { cursor: default; opacity: 0.5; font-style: italic; }
  .pro-lc-table .sw-row.sw-active { opacity: 0.85; }
  .sw-check { cursor: pointer; accent-color: #4ecdc4; }
  .lc-type { width: 40px; }
  .lc-type-select { background: transparent; border: 1px solid transparent; border-radius: 3px; color: #aaa; font-size: 0.7rem; padding: 1px 2px; cursor: pointer; }
  .lc-type-select:hover { border-color: #1a4a7a; }
  .lc-type-select:focus { background: #0f2840; border-color: #1a4a7a; outline: none; }
  .lc-type-select option { background: #0d1b2e; color: #ccc; }
  .lc-name { }
  .lc-name-input { background: transparent; border: 1px solid transparent; border-radius: 3px; color: #ccc; font-size: 0.72rem; padding: 2px 4px; width: 100%; }
  .lc-name-input:hover { border-color: #1a4a7a; }
  .lc-name-input:focus { background: #0f2840; border-color: #1a4a7a; outline: none; }
  .lc-count { width: 40px; text-align: center; color: #667; font-family: monospace; font-size: 0.68rem; }
  .lc-vis { width: 24px; text-align: center; }
  .lc-vis-btn { background: none; border: none; font-size: 0.7rem; cursor: pointer; opacity: 0.9; padding: 0; transition: opacity 0.12s; }
  .lc-vis-btn.hidden-case { opacity: 0.2; text-decoration: line-through; }
  .lc-del { width: 20px; text-align: center; }
  .sw-auto-badge {
    font-size: 0.55rem; color: #4ecdc4; background: rgba(78, 205, 196, 0.12);
    padding: 1px 4px; border-radius: 3px; font-style: normal; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.03em;
  }
  .sw-factor-row { opacity: 0.7; }
  .sw-factor-display {
    display: inline-block; width: 40px; text-align: center;
    font-size: 0.72rem; font-family: monospace; color: #aab;
  }
  .case-eye {
    background: none; border: none; font-size: 0.7rem; cursor: pointer;
    padding: 0 2px; line-height: 1; opacity: 0.4; transition: opacity 0.15s;
  }
  .case-eye.visible { opacity: 0.9; }
  .case-eye:hover { opacity: 1; }
  .case-x { background: none; border: none; color: #555; font-size: 0.8rem; cursor: pointer; padding: 0 0 0 4px; line-height: 1; }
  .case-x:hover { color: #ff6b6b; }

  .case-type-dot { width: 6px; height: 6px; border-radius: 50%; background: #555; flex-shrink: 0; }
  .case-type-dot.type-d { background: #4ecdc4; }
  .case-type-dot.type-l { background: #f0a500; }
  .case-type-dot.type-w { background: #6bbaff; }
  .case-type-dot.type-lr { background: #c0a040; }
  .case-type-dot.type-e { background: #e94560; }

  .pro-case-add {
    display: flex; gap: 6px; padding: 6px 10px 8px; align-items: center;
  }
  .inp-case {
    width: 110px; padding: 4px 6px; background: #0f2840; border: 1px solid #1a3050;
    border-radius: 3px; color: #ddd; font-size: 0.72rem;
  }
  .inp-case:focus { border-color: #1a4a7a; outline: none; }
  .pro-sel-sm {
    padding: 4px 5px; background: #0f2840; border: 1px solid #1a3050;
    border-radius: 3px; color: #ccc; font-size: 0.72rem; cursor: pointer;
  }
  .pro-btn-sm {
    padding: 4px 10px; font-size: 0.72rem; color: #4ecdc4; background: #0f3460;
    border: 1px solid #1a4a7a; border-radius: 4px; cursor: pointer;
  }
  .pro-btn-sm:hover { background: #1a4a7a; color: #fff; }

  /* Combinations */
  .pro-combos-section { border-bottom: 1px solid #1a3050; padding: 6px 10px; }
  .pro-combos-list { padding: 6px 0; display: flex; flex-direction: column; gap: 6px; }
  .pro-combo-card {
    background: #0a1828; border: 1px solid #12253d; border-radius: 5px;
    padding: 6px 10px; margin-bottom: 6px;
  }
  .combo-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  .combo-header .pro-delete-btn { margin-left: auto; }
  .combo-prov-badge { font-size: 0.52rem; font-weight: 700; padding: 1px 5px; border-radius: 3px; text-transform: uppercase; letter-spacing: 0.05em; }
  .combo-prov-lrfd { color: #e94560; background: rgba(233,69,96,0.1); border: 1px solid rgba(233,69,96,0.2); }
  .combo-prov-svc { color: #4ecdc4; background: rgba(78,205,196,0.1); border: 1px solid rgba(78,205,196,0.2); }
  .combo-name { font-size: 0.75rem; color: #ccc; font-weight: 600; }
  .combo-factor-table { border-collapse: collapse; width: 100%; }
  .combo-factor-table td { padding: 2px 4px; font-size: 0.7rem; color: #aaa; }
  .combo-factor-val { width: 44px; }
  .combo-factor-mult { width: 14px; color: #556; text-align: center; }
  .combo-factor-name { color: #889; }
  .inp-factor {
    width: 40px; padding: 3px 4px; background: #0f2840; border: 1px solid #1a3050;
    border-radius: 3px; color: #ddd; font-size: 0.72rem; font-family: monospace; text-align: center;
  }
  .inp-factor:focus { border-color: #1a4a7a; outline: none; }
  .pro-combo-add { display: flex; gap: 6px; align-items: center; padding-top: 6px; }
  .pro-combo-generate { display: flex; gap: 8px; align-items: center; padding-top: 8px; border-top: 1px solid #12253d; margin-top: 8px; }
  .pro-combo-gen-hint { font-size: 0.65rem; color: #556; font-style: italic; }

  /* LRFD Generator Modal */
  .combo-modal-backdrop { position: fixed; inset: 0; z-index: 500; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; }
  .combo-modal { background: #0d1b2e; border: 1px solid #1a4a7a; border-radius: 10px; width: min(520px, calc(100vw - 40px)); max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 12px 40px rgba(0,0,0,0.5); }
  .combo-modal-header { padding: 14px 18px; border-bottom: 1px solid #1a3050; display: flex; align-items: center; gap: 10px; }
  .combo-modal-header h3 { font-size: 0.85rem; color: #eee; font-weight: 700; margin: 0; }
  .combo-modal-sub { font-size: 0.62rem; color: #4ecdc4; background: rgba(78,205,196,0.1); padding: 2px 6px; border-radius: 3px; }
  .combo-modal-close { margin-left: auto; background: none; border: none; color: #666; font-size: 1.1rem; cursor: pointer; }
  .combo-modal-close:hover { color: #e94560; }
  .combo-modal-body { flex: 1; overflow-y: auto; padding: 8px 12px; }
  .combo-cand-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 5px; cursor: pointer; font-size: 0.75rem; color: #ccc; transition: background 0.1s; }
  .combo-cand-row:hover { background: rgba(78,205,196,0.06); }
  .combo-cand-row.combo-exists { opacity: 0.5; }
  .combo-cand-row input[type="checkbox"] { accent-color: #4ecdc4; cursor: pointer; }
  .combo-cand-name { font-weight: 600; min-width: 120px; color: #ddd; }
  .combo-cand-factors { font-size: 0.62rem; color: #778; flex: 1; display: flex; flex-direction: column; gap: 1px; }
  .cand-factor-row { display: flex; gap: 4px; align-items: baseline; }
  .cand-f-val { font-family: monospace; min-width: 28px; text-align: right; color: #99a; }
  .cand-f-type { font-weight: 600; color: #556; min-width: 16px; }
  .cand-f-name { color: #667; }
  .combo-exists-badge { font-size: 0.58rem; color: #f0a500; background: rgba(240,165,0,0.1); padding: 1px 6px; border-radius: 3px; white-space: nowrap; }
  .combo-modal-footer { padding: 10px 18px; border-top: 1px solid #1a3050; display: flex; align-items: center; gap: 8px; }
  .combo-modal-count { flex: 1; font-size: 0.68rem; color: #667; }

  .pro-loads-header { padding: 8px 12px; border-bottom: 1px solid #1a3050; }
  .pro-loads-count { font-size: 0.78rem; color: #4ecdc4; font-weight: 600; }

  .pro-addload-section { border-bottom: 1px solid #1a3050; padding: 6px 10px; }
  .pro-loads-form { padding: 6px 0 4px; }
  .pro-kind-row { display: flex; gap: 5px; margin-bottom: 10px; }
  .pro-type-btn {
    padding: 5px 10px; font-size: 0.75rem; font-weight: 500; color: #888;
    background: #0f2840; border: 1px solid #1a3050; border-radius: 4px; cursor: pointer;
  }
  .pro-type-btn:hover { color: #ccc; background: #1a3860; }
  .pro-type-btn.active { color: #fff; background: #1a4a7a; border-color: #4ecdc4; }

  .pro-load-inputs { display: flex; flex-direction: column; gap: 8px; }
  .pro-load-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .pro-load-row label { font-size: 0.75rem; color: #888; display: flex; align-items: center; gap: 4px; }
  .inp-sm { width: 55px; padding: 4px 6px; background: #0f2840; border: 1px solid #1a3050; border-radius: 3px; color: #ddd; font-size: 0.78rem; font-family: monospace; }
  .inp-num { width: 65px; padding: 4px 6px; background: #0f2840; border: 1px solid #1a3050; border-radius: 3px; color: #ddd; font-size: 0.78rem; font-family: monospace; }
  .inp-sm:focus, .inp-num:focus { border-color: #1a4a7a; outline: none; }
  .pro-btn { align-self: flex-start; padding: 5px 14px; font-size: 0.75rem; color: #ccc; background: #0f3460; border: 1px solid #1a4a7a; border-radius: 4px; cursor: pointer; }
  .pro-btn:hover { background: #1a4a7a; color: #fff; }
  .pro-load-target {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 4px;
    border-top: 1px solid #1a3050;
    margin-top: 4px;
  }
  .target-byid {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .target-byid label { font-size: 0.75rem; color: #888; display: flex; align-items: center; gap: 4px; }
  .target-sel {  }
  .pro-btn-sel { font-size: 0.72rem; color: #4ecdc4; border-color: #2a5a6a; background: #0a2a40; padding: 5px 14px; border-radius: 4px; border: 1px solid #2a5a6a; cursor: pointer; }
  .pro-btn-sel:hover { background: #1a4a6a; color: #fff; }
  .pro-btn-sel::before { content: '\u2714 '; }

  .pro-loads-table-wrap { }
  .pro-load-section-title { padding: 8px 12px 4px; font-size: 0.68rem; font-weight: 600; color: #4ecdc4; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 6px; }
  .pro-loads-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
  .pro-loads-table thead { position: sticky; top: 0; z-index: 1; }
  .pro-loads-table th { padding: 6px 6px; text-align: left; font-size: 0.68rem; font-weight: 600; color: #888; text-transform: uppercase; background: #0a1a30; border-bottom: 1px solid #1a4a7a; }
  .pro-loads-table td { padding: 4px 6px; border-bottom: 1px solid #0f2030; color: #ccc; }
  .pro-loads-table tbody tr { cursor: pointer; transition: background 0.1s; }
  .pro-loads-table tbody tr:hover { background: rgba(78, 205, 196, 0.08); }
  .pro-loads-table tbody tr.selected { background: rgba(78, 205, 196, 0.18); box-shadow: inset 3px 0 0 #4ecdc4; }
  .inp-cell {
    background: transparent; border: 1px solid transparent; border-radius: 3px;
    color: #ccc; font-size: 0.72rem; font-family: monospace; padding: 2px 4px;
    width: 60px; text-align: right;
  }
  .inp-cell:hover { border-color: #1a4a7a; }
  .inp-cell:focus { background: #0f2840; border-color: #1a4a7a; outline: none; }
  .col-id { width: 32px; color: #666; font-family: monospace; text-align: center; }
  .col-num { font-family: monospace; text-align: right; font-size: 0.75rem; }
  .pro-delete-btn { background: none; border: none; color: #555; font-size: 1rem; cursor: pointer; padding: 0; }
  .pro-delete-btn:hover { color: #ff6b6b; }
  .pro-empty { text-align: center; color: #555; font-style: italic; padding: 30px 10px; font-size: 0.78rem; }
</style>
