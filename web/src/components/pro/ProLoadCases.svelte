<script lang="ts">
  /**
   * The load cases: which ones show in the model, the self-weight, the table of cases, and the
   * form that makes a new one.
   *
   * A new case is a type and, if wanted, a name: the type comes first because it decides how
   * the case combines, and a case left unnamed takes its type's name ("Sobrecarga 2" when there
   * is one already), so pressing Add with nothing typed still gives a usable case.
   */
  import { modelStore, uiStore, resultsStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import ProSelfWeight from './ProSelfWeight.svelte';
  import VisibilityToggle from './VisibilityToggle.svelte';
  import Icon from '../ribbon/Icon.svelte';
  import type { AutoLoadFocus } from './ProAutoLoadsDialog.svelte';
  import { duplicateCase, caseDeletionScope } from '../../lib/store/load-ops';
  import { tp } from '../../lib/i18n';
  import ProCaseDetails from './loads/ProCaseDetails.svelte';
  import { parseDecimal } from '../../lib/utils/numeric-input';
  import { caseOrder } from '../../lib/engine/case-effects';

  /** The case whose composition is open below its row. */
  let open = $state<number | null>(null);

  // ── Notional cases from others ──
  let notSources = $state<number[]>([]);
  let notRatio = $state('0.002');
  let notDirs = $state<Array<'+X' | '-X' | '+Y' | '-Y'>>(['+X', '-X', '+Y', '-Y']);
  /** One notional case per source and direction (`case-effects.ts`), in one undo step. */
  function addNotionalCases() {
    const ratio = parseDecimal(notRatio);
    if (ratio === null || !(ratio > 0) || !notSources.length || !notDirs.length) return;
    modelStore.batch(() => {
      for (const src of notSources) {
        const s = modelStore.model.loadCases.find((c) => c.id === src);
        if (!s) continue;
        for (const dir of notDirs) {
          const id = modelStore.addLoadCase(tp('caseDetails.notionalName', { dir, name: s.name }), 'N');
          modelStore.updateLoadCaseFields(id, { notional: { sourceCaseId: src, ratio, dir } });
        }
      }
    });
  }

  interface Props {
    /** Open the regulation dialog on the section a case row asks for. */
    oncode: (focus: AutoLoadFocus) => void;
  }
  let { oncode }: Props = $props();

  const loads = $derived(modelStore.loads);
  const loadCases = $derived(modelStore.model.loadCases);
  /** Cases that read themselves (a file can hold such a loop): solved, they take nothing in. */
  const looped = $derived(caseOrder(loadCases).looped);

  /** The types a case can take, in the order the regulation lists them. */
  const TYPES = ['D', 'L', 'Lr', 'S', 'R', 'W', 'Wa', 'E', 'T', 'F', 'H', 'N', 'Cr', 'Tr', 'M', 'A', 'I', ''] as const;
  const typeName = (ty: string) => t(`pro.caseType${ty || 'Other'}`);

  // ── Visibility per case ──
  function isCaseVisible(caseId: number): boolean {
    const vis = uiStore.visibleLoadCases3D;
    return vis === null || vis.includes(caseId);
  }
  function toggleCaseVisibility(caseId: number) {
    const current = uiStore.visibleLoadCases3D;
    if (current === null) {
      uiStore.visibleLoadCases3D = loadCases.map((lc) => lc.id).filter((id) => id !== caseId);
    } else if (current.includes(caseId)) {
      uiStore.visibleLoadCases3D = current.filter((id) => id !== caseId);
    } else {
      const next = [...current, caseId];
      uiStore.visibleLoadCases3D = next.length >= loadCases.length ? null : next;
    }
    uiStore.showLoads3D = true;
  }
  function showAllCases() {
    uiStore.visibleLoadCases3D = null;
    uiStore.showLoads3D = true;
    uiStore.hideLoadsWithDiagram = false;
  }
  function hideAllCases() { uiStore.visibleLoadCases3D = []; }

  /** Select every load of a case in the viewport; `selectedLoads` holds load data ids. */
  function selectLoadsByCase(caseId: number) {
    uiStore.selectMode = 'loads';
    uiStore.clearSelection();
    uiStore.selectedLoads = new Set(modelStore.loads.filter((l) => (l.data.caseId ?? 1) === caseId).map((l) => l.data.id));
  }

  /**
   * Which of the dialog's sections a case row asks for: Lr its roof section, Wa the wind block it
   * comes with, T, H and F the special actions. Null hides the button (a rain case: the generator
   * makes none).
   */
  function codeFocusFor(type: string | undefined): AutoLoadFocus | null {
    switch ((type ?? '').toUpperCase()) {
      case 'D': return 'dead';
      case 'L': return 'live';
      case 'LR': return 'roof';
      case 'W': case 'WA': return 'wind';
      case 'S': return 'snow';
      case 'E': return 'seismic';
      case 'T': case 'H': case 'F': return 'special';
      default: return null;
    }
  }

  /** The case a row asks to delete, waiting for the user to say yes: it takes its loads with it. */
  let confirming = $state<number | null>(null);
  const scope = $derived(confirming === null ? null : caseDeletionScope(confirming));
  function removeLoadCase(id: number) {
    modelStore.removeLoadCase(id);
    if (uiStore.activeLoadCaseId === id) uiStore.activeLoadCaseId = loadCases[0]?.id ?? 1;
    confirming = null;
  }
  /** A copy of the case and its loads, named after it, made active. */
  function duplicate(id: number) {
    const lc = loadCases.find((c) => c.id === id);
    if (!lc) return;
    const taken = new Set(loadCases.map((c) => c.name));
    let name = tp('pro.caseCopyName', { name: lc.name });
    for (let n = 2; taken.has(name); n++) name = `${tp('pro.caseCopyName', { name: lc.name })} ${n}`;
    const nid = duplicateCase(id, name);
    if (nid !== null) uiStore.activeLoadCaseId = nid;
  }

  // ── New case ──
  let newType = $state<string>('D');
  let newName = $state('');
  /** The type's name, without its symbol, numbered when a case already has it. */
  const defaultName = $derived.by(() => {
    const base = typeName(newType).replace(/\s*\([^)]*\)\s*$/, '');
    const taken = new Set(loadCases.map((c) => c.name));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base} ${n}`)) n++;
    return `${base} ${n}`;
  });
  function addLoadCase(e: SubmitEvent) {
    e.preventDefault();
    const id = modelStore.addLoadCase(newName.trim() || defaultName, newType);
    uiStore.activeLoadCaseId = id;
    newName = '';
  }
</script>

<div class="lc-vis-bar">
  <label class="pk-check">
    <input type="checkbox" checked={uiStore.showLoads3D} onchange={(e) => { uiStore.showLoads3D = e.currentTarget.checked; if (e.currentTarget.checked) uiStore.hideLoadsWithDiagram = false; }} />
    {t('pro.showLoads')}
  </label>
  {#if uiStore.showLoads3D && uiStore.hideLoadsWithDiagram && resultsStore.diagramType !== 'none'}
    <button class="pk-btn lc-warn" onclick={() => { uiStore.hideLoadsWithDiagram = false; uiStore.showLoads3D = true; }}>
      {t('pro.loadsHiddenByDiagram')}
    </button>
  {/if}
  <!-- The reader's factor on every arrow: a small load beside a large one stays readable. -->
  <label class="lc-scale" title={t('pro.loadScaleHint')}>{t('pro.loadScale')}
    <select value={String(uiStore.loadArrowScale)} onchange={(e) => (uiStore.loadArrowScale = Number(e.currentTarget.value))} data-testid="lc-arrow-scale">
      {#each [0.25, 0.5, 1, 2, 4, 8] as k (k)}<option value={String(k)}>×{k}</option>{/each}
    </select>
  </label>
  <span class="lc-vis-all">
    <button class="pk-btn" onclick={showAllCases} title={t('pro.showAllCases')} data-testid="lc-show-all"><Icon name="eye" size={14} /> {t('pro.showAll')}</button>
    <button class="pk-btn" onclick={hideAllCases} title={t('pro.hideAllCases')} data-testid="lc-hide-all"><Icon name="eye-off" size={14} /> {t('pro.hideAll')}</button>
  </span>
</div>

<ProSelfWeight />

<table class="lc-table">
  <thead><tr><th></th><th>{t('pro.lcType')}</th><th>{t('pro.lcName')}</th><th>{t('pro.lcLoads')}</th><th title={t('autoLoad.defineFromCode')}>§</th><th></th><th></th><th></th><th></th></tr></thead>
  <tbody>
    {#each loadCases as lc (lc.id)}
      {@const count = loads.filter((l) => (l.data.caseId ?? 1) === lc.id).length}
      {@const focus = codeFocusFor(lc.type)}
      <tr class:active={uiStore.activeLoadCaseId === lc.id} onclick={() => { uiStore.activeLoadCaseId = lc.id; selectLoadsByCase(lc.id); }} data-testid="lc-row">
        <td><span class="dot" class:type-d={lc.type === 'D'} class:type-l={lc.type === 'L'} class:type-lr={lc.type === 'Lr'} class:type-w={lc.type === 'W' || lc.type === 'Wa'} class:type-e={lc.type === 'E'}></span></td>
        <td class="lc-type">
          <select class="cell" value={lc.type} onclick={(e) => e.stopPropagation()} onchange={(e) => modelStore.updateLoadCaseType(lc.id, e.currentTarget.value)} aria-label={t('pro.lcType')}>
            {#each TYPES as ty (ty)}<option value={ty} title={typeName(ty)}>{ty || '—'}</option>{/each}
          </select>
        </td>
        <td class="lc-name-cell"><input class="cell lc-name" type="text" value={lc.name} onclick={(e) => e.stopPropagation()} onchange={(e) => modelStore.updateLoadCase(lc.id, e.currentTarget.value)} aria-label={t('pro.lcName')} />
          <!-- One of an alternatives group (a checkerboard, an unbalanced snow): the combinations
               take one case of the group at a time. -->
          {#if lc.alternatives}<span class="lc-alt" title={t('pro.lcAlternativeHint')} data-testid="lc-alt-{lc.id}">{t('pro.lcAlternative')}</span>{/if}
          {#if lc.pattern}<span class="lc-alt" title={t('caseDetails.pattern')}>{t('caseDetails.patternBadge')}</span>{/if}
          {#if lc.includes?.length}<span class="lc-alt" title={t('caseDetails.includes')} data-testid="lc-composite-{lc.id}">⊕ {lc.includes.length}</span>{/if}
          {#if lc.reference}<span class="lc-alt" title={t('caseDetails.reference')} data-testid="lc-ref-{lc.id}">{t('caseDetails.referenceBadge')}</span>
          {:else if lc.solve === false}<span class="lc-alt" title={t('caseDetails.solve')}>{t('caseDetails.notSolvedBadge')}</span>{/if}
          {#if lc.notional}<span class="lc-alt" title={t('caseDetails.notional')}>{lc.notional.ratio} · {lc.notional.dir}</span>{/if}
          {#if lc.reduction}<span class="lc-alt" title={t('caseDetails.reduction')}>× {lc.reduction.ratio.toFixed(2)}</span>{/if}
          {#if looped.has(lc.id)}<span class="lc-alt lc-loop" title={t('caseDetails.loop')} data-testid="lc-loop-{lc.id}">{t('caseDetails.loopBadge')}</span>{/if}</td>
        <td class="lc-count">{count}</td>
        <!-- The regulation for THIS case, from the row that names it: a row that says W wants
             the wind parameters, not a dialog where they are the fourth section down. -->
        <td class="lc-narrow">{#if focus}<button class="lc-code" onclick={(e) => { e.stopPropagation(); oncode(focus); }}
          title={t('autoLoad.defineFromCode')} aria-label={t('autoLoad.defineFromCode')} data-testid="lc-code-{lc.type}">§</button>{/if}</td>
        <td class="lc-narrow"><VisibilityToggle visible={isCaseVisible(lc.id)} ontoggle={() => toggleCaseVisibility(lc.id)}
          showLabel={t('pro.showCase')} hideLabel={t('pro.hideCase')} testid="lc-vis-{lc.id}" /></td>
        <td class="lc-narrow"><button class="lc-code" onclick={(e) => { e.stopPropagation(); duplicate(lc.id); }}
          aria-label={t('pro.duplicateCase')} title={t('pro.duplicateCase')} data-testid="lc-dup-{lc.id}">⧉</button></td>
        <td class="lc-narrow"><button class="lc-code" onclick={(e) => { e.stopPropagation(); open = open === lc.id ? null : lc.id; }}
          aria-expanded={open === lc.id} aria-label={t('caseDetails.open')} title={t('caseDetails.open')} data-testid="lc-open-{lc.id}">⚙</button></td>
        <td class="lc-narrow">{#if loadCases.length > 1}<button class="lc-x" onclick={(e) => { e.stopPropagation(); confirming = lc.id; }} aria-label={t('pro.removeCase')} title={t('pro.removeCase')} data-testid="lc-del-{lc.id}">×</button>{/if}</td>
      </tr>
      {#if open === lc.id}
        <tr class="lc-details"><td colspan="9"><ProCaseDetails {lc} /></td></tr>
      {/if}
      {#if confirming === lc.id && scope}
        <!-- Deleting a case takes its loads and its place in the combinations: said, then done. -->
        <tr class="lc-confirm" data-testid="lc-confirm-{lc.id}">
          <td colspan="9">
            <!-- And what removeLoadCase takes beyond the loads: self-weight rows, a mass-source factor,
                 its place in composite cases, the source of notional cases (left empty). -->
            <span>{tp('pro.removeCaseConfirm', { name: lc.name, loads: scope.loads, combos: scope.combinations })}{#if scope.selfWeight}{' '}{tp('pro.removeCaseSelfWeight', { n: scope.selfWeight })}{/if}{#if scope.mass}{' '}{t('pro.removeCaseMass')}{/if}{#if scope.composites.length}{' '}{tp('pro.removeCaseComposites', { names: scope.composites.join(', ') })}{/if}{#if scope.notional.length}{' '}{tp('pro.removeCaseNotional', { names: scope.notional.join(', ') })}{/if}</span>
            <button class="pk-btn lc-danger" onclick={(e) => { e.stopPropagation(); removeLoadCase(lc.id); }} data-testid="lc-confirm-yes">{t('pro.removeCase')}</button>
            <button class="pk-btn" onclick={(e) => { e.stopPropagation(); confirming = null; }}>{t('calcReport.cancel')}</button>
          </td>
        </tr>
      {/if}
    {/each}
  </tbody>
</table>

<details class="lc-notional" data-testid="lc-notional">
  <summary>{t('caseDetails.notionalCases')}</summary>
  <p class="lc-hint">{t('caseDetails.notionalCasesHint')}</p>
  <div class="lc-not-row">
    {#each loadCases.filter((c) => !c.notional) as c (c.id)}
      <label><input type="checkbox" checked={notSources.includes(c.id)} onchange={(e) => (notSources = e.currentTarget.checked ? [...notSources, c.id] : notSources.filter((x) => x !== c.id))} data-testid="lc-not-src-{c.id}" /> {c.type ? `${c.type} · ` : ''}{c.name}</label>
    {/each}
  </div>
  <div class="lc-not-row">
    <label>{t('caseDetails.ratio')} <input type="text" bind:value={notRatio} class="lc-not-num" data-testid="lc-not-ratio" /></label>
    {#each ['+X', '-X', '+Y', '-Y'] as d (d)}
      <label><input type="checkbox" checked={notDirs.includes(d as '+X')} onchange={(e) => (notDirs = e.currentTarget.checked ? [...notDirs, d as '+X'] : notDirs.filter((x) => x !== d))} /> {d}</label>
    {/each}
    <button class="pk-btn" disabled={!notSources.length || !notDirs.length} onclick={addNotionalCases} data-testid="lc-not-add">{t('caseDetails.notionalAdd')}</button>
  </div>
</details>

<form class="lc-new" onsubmit={addLoadCase} data-testid="lc-new">
  <span class="lc-new-title">{t('pro.newCase')}</span>
  <label class="lc-new-field"><span class="pk-label">{t('pro.lcType')}</span>
    <select bind:value={newType} data-testid="lc-new-type">
      {#each TYPES as ty (ty)}<option value={ty}>{typeName(ty)}</option>{/each}
    </select>
  </label>
  <label class="lc-new-field lc-new-grow"><span class="pk-label">{t('pro.lcName')}</span>
    <input type="text" bind:value={newName} placeholder={defaultName} data-testid="lc-new-name" />
  </label>
  <button type="submit" class="pk-btn pk-btn-primary" data-testid="lc-new-add">{t('pro.addCase')}</button>
</form>

<style>
  .lc-vis-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 4px 0 6px; font-size: 0.72rem; color: var(--st-text-2); }
  .lc-vis-all { display: inline-flex; gap: 4px; margin-left: auto; }
  .lc-warn { color: var(--st-warn); }
  .lc-scale { display: inline-flex; align-items: center; gap: 4px; }
  .lc-scale select { background: var(--st-surface-3); border: 1px solid var(--st-hair); border-radius: 3px; color: var(--st-text-2); font-size: 0.68rem; }

  .lc-table { width: 100%; border-collapse: collapse; font-size: 0.74rem; }
  .lc-table th { padding: 4px 6px; font-size: 0.62rem; font-weight: 600; color: var(--st-text-3); text-transform: uppercase; text-align: left; border-bottom: 1px solid var(--st-hair); }
  .lc-table td { padding: 3px 6px; border-bottom: 1px solid var(--st-surface-2); }
  .lc-table tbody tr { cursor: pointer; transition: background 0.1s; }
  .lc-table tbody tr:hover { background: var(--st-surface-3); }
  .lc-table tbody tr.active { background: var(--st-selected-bg); box-shadow: inset 3px 0 0 var(--st-value); }
  .lc-type { width: 48px; }
  .lc-count { width: 40px; text-align: center; color: var(--st-text-3); font-family: var(--st-mono); font-size: 0.68rem; }
  .lc-narrow { width: 22px; text-align: center; padding-left: 2px; padding-right: 2px; }
  .cell { background: transparent; border: 1px solid transparent; border-radius: var(--st-radius); color: var(--st-text-2); font-size: 0.72rem; padding: 1px 3px; }
  .cell:hover { border-color: var(--st-hair-strong); }
  .cell:focus { background: var(--st-surface-3); border-color: var(--st-hair-strong); outline: none; }
  .lc-name { width: 100%; }
  .lc-code, .lc-x { background: none; border: none; color: var(--st-text-3); font-size: 0.8rem; line-height: 1; cursor: pointer; padding: 0 2px; }
  .lc-code:hover { color: var(--st-accent); }
  .lc-x { font-size: 0.95rem; }
  .lc-x:hover { color: var(--st-danger); }

  /* One hue per case type; category marks, not status. */
  .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--st-text-3); }
  .dot.type-d { background: var(--st-value); }
  .dot.type-l { background: var(--st-warn); }
  .dot.type-w { background: var(--st-info); }
  .dot.type-lr { background: var(--st-ok); }
  .dot.type-e { background: var(--st-accent); }

  .lc-new {
    display: flex; flex-wrap: wrap; align-items: flex-end; gap: 6px 8px;
    margin-top: 8px; padding: 6px 8px 8px;
    border: 1px dashed var(--st-hair-strong); border-radius: var(--st-radius);
    font-size: 0.7rem;
  }
  .lc-new-title { flex-basis: 100%; color: var(--st-text); font-weight: 600; }
  .lc-new-field { display: flex; flex-direction: column; gap: 2px; }
  .lc-new-grow { flex: 1; min-width: 7rem; }
  .lc-new-grow input { width: 100%; }
  .lc-name-cell { display: flex; align-items: center; gap: 4px; }
  .lc-confirm td { background: var(--st-surface-2); font-size: 0.68rem; color: var(--st-text-2); }
  .lc-confirm td span { margin-right: 6px; }
  .lc-danger { color: var(--st-danger); border-color: var(--st-danger); }
  .lc-details td { background: var(--st-surface-2); cursor: default; }
  .lc-notional { margin-top: 8px; font-size: 0.7rem; color: var(--st-text-2); }
  .lc-notional summary { cursor: pointer; color: var(--st-text); font-weight: 600; }
  .lc-hint { margin: 2px 0; font-size: 0.62rem; color: var(--st-text-3); }
  .lc-not-row { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; margin-top: 4px; }
  .lc-not-row label { display: inline-flex; align-items: center; gap: 3px; }
  .lc-not-num { width: 56px; font-family: var(--st-mono); }
  .lc-alt { flex: none; padding: 0 5px; line-height: 16px; border: 1px solid var(--st-hair); border-radius: var(--st-radius); color: var(--st-text-3); font-size: 0.6rem; }
  .lc-loop { color: var(--st-warn); border-color: var(--st-warn); }
</style>
