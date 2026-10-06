<script lang="ts">
  import ProWriteLoadCard from './loads/ProWriteLoadCard.svelte';
  import ProLoadTables from './loads/ProLoadTables.svelte';
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
  import { t } from '../../lib/i18n';
  import WriteInPanelButton from './WriteInPanelButton.svelte';
  import WriteCard from './WriteCard.svelte';
  import { drawState } from '../../lib/store/draw-state.svelte';
  import DrawInModelButton from './DrawInModelButton.svelte';
  import ProAutoLoadsDialog from './ProAutoLoadsDialog.svelte';
  import type { AutoLoadFocus } from './ProAutoLoadsDialog.svelte';

  let showAutoLoadsDialog = $state(false);

  /*
   * The case new loads go to is the one "Draw load" uses too (`uiStore.activeLoadCaseId`).
   * Writing a load is `ProWriteLoadCard`; the tables and the operations on loads, `ProLoadTables`.
   */
  const loadCases = $derived(modelStore.model.loadCases);
  const combinations = $derived(modelStore.model.combinations);

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
  <ProWriteLoadCard />
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


  <ProLoadTables />
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

  .pro-addload-section { border-bottom: 1px solid var(--st-surface-3); }
  .combo-senses-hint { margin: 0; padding: 0 12px 6px; font-size: 0.62rem; color: var(--st-text-3); }
  .combo-wind-basis { display: flex; gap: 6px; align-items: center; padding: 6px 12px; font-size: 0.68rem; color: var(--st-text-2); border-bottom: 1px solid var(--st-hair); }
</style>
