<script lang="ts">
  import { signedAxisText } from '../../../lib/axes/typed-frame';
  import { modelIndexOfUser } from '../../../lib/axes/display';
  import Hint from '../Hint.svelte';
  /**
   * One case's composition and how it is solved (`engine/case-effects.ts`,
   * `engine/combination-methods.ts`): the cases it takes in with their factors, whether it is a
   * reference or solved on its own, its alternatives group and pattern, its notional loads and its
   * reduction. Each change is one undo step.
   *
   * Nothing here can make a case read itself: the cases offered to take in and as a notional
   * source leave out every one that would bring it back (the store refuses it too, `addsLoop`; a
   * change it refuses is put back on screen and said), and a case already in a loop, from a file,
   * says so and can still be edited, any link of its loop removed. A composite case with a load
   * type says that the generator, the mass rules and the self-weight do not take it as one
   * (`isCompositeCase`).
   */
  import { modelStore, uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { te } from '../../../lib/i18n/engine-text';
  import { parseDecimal } from '../../../lib/utils/numeric-input';
  import QuantityInput from './QuantityInput.svelte';
  import { addsLoop, caseOrder } from '../../../lib/engine/case-effects';
  import { symbolOfType } from '../../../lib/engine/loads/combination-cases';
  import { caseReduction, caseReductionRefusal, holdsGeneratorReducedLoads } from '../../../lib/engine/loads/case-reduction';
  import { OCCUPANCY_TABLE_2025, type ElementKind } from '../../../lib/codes/cirsoc101/live-loads';
  import { loadCodeFor } from '../../../lib/codes/families';
  import { regulationsStore } from '../../../lib/store/regulations.svelte';
  import type { LoadCase } from '../../../lib/store/model.svelte';
  import type { SpectralCaseDef } from '../../../lib/engine/spectral-case';
  import { codeSpectrumScale, staleCodeScale } from '../../../lib/store/spectral-cases';

  interface Props { lc: LoadCase }
  let { lc }: Props = $props();

  const cases = $derived(modelStore.model.loadCases);
  /**
   * The change, or false when the store refuses it (a loop it would make): then said, and the
   * field that asked for it is put back by the caller, or it kept a value never saved.
   */
  const update = (patch: Parameters<typeof modelStore.updateLoadCaseFields>[1]): boolean => {
    const ok = modelStore.updateLoadCaseFields(lc.id, patch);
    if (!ok) uiStore.toast(t('caseDetails.loopRefused'), 'error');
    return ok;
  };

  // ── Taken in ──
  const includes = $derived(lc.includes ?? []);
  /** The cases this one can take in: not itself, nor any that would make a loop it has not. */
  const takeable = $derived(cases.filter((c) => c.id !== lc.id && !addsLoop(cases, lc.id, { includes: [...includes, { caseId: c.id, factor: 1 }] })));
  /** A row's choices: the cases it can take, and the one it takes, even when that one loops. */
  const choicesFor = (caseId: number) => (takeable.some((c) => c.id === caseId) ? takeable : [...cases.filter((c) => c.id === caseId), ...takeable]);
  /** Already in a loop (a file can hold one): solved, it takes nothing in. */
  const looped = $derived(caseOrder(cases).looped.has(lc.id));
  /** A composite case with a load type: not taken as one (`combination-cases.ts` `isCompositeCase`). */
  const typedComposite = $derived(includes.length > 0 && symbolOfType(lc.type) !== null);
  function setInclude(i: number, patch: Partial<{ caseId: number; factor: number }>): boolean {
    return update({ includes: includes.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  }
  function addInclude() {
    const first = takeable.find((c) => !includes.some((x) => x.caseId === c.id));
    if (first) update({ includes: [...includes, { caseId: first.id, factor: 1 }] });
  }

  // ── Notional ──
  const notional = $derived(lc.notional);
  /** The cases this one can read its notional loads off: not itself, nor any that would make a loop. */
  const sourceable = $derived(cases.filter((c) => c.id !== lc.id && !addsLoop(cases, lc.id, { notional: { sourceCaseId: c.id, ratio: 1, dir: '+X' as const } })));
  /** The source's choices: those it can read, and the one it reads, even when that one loops. */
  const sources = $derived(notional && !sourceable.some((c) => c.id === notional.sourceCaseId) ? [...cases.filter((c) => c.id === notional.sourceCaseId), ...sourceable] : sourceable);
  function setNotional(patch: Partial<NonNullable<LoadCase['notional']>>): boolean {
    // With no case to read, none: it fell back to the case itself, a loop of one.
    const source = notional?.sourceCaseId ?? sourceable[0]?.id;
    if (source === undefined && patch.sourceCaseId === undefined) return false;
    const base = notional ?? { sourceCaseId: source!, ratio: 0.002, dir: '+X' as const };
    return update({ notional: { ...base, ...patch } });
  }

  // ── Reduction (`engine/loads/case-reduction.ts`) ──
  const loadsBinding = $derived(regulationsStore.binding('loads'));
  /** m² (SI), typed in the project's units; empty is no area yet. */
  let area = $state<number | null>(lc.reduction?.tributaryAreaM2 ?? null);
  let kind = $state(lc.reduction?.elementKind ?? 'interiorBeam');
  let floors = $state(String(lc.reduction?.floorsSupported ?? 1));
  // Lo and the row's exclusions: the occupancy stated, else the project's (the generator's).
  let occupancyKey = $state(lc.reduction?.occupancyKey ?? String((regulationsStore.binding('loads')?.settings as Record<string, unknown> | undefined)?.occupancyKey ?? 'vivienda'));
  const occupancies = OCCUPANCY_TABLE_2025.filter((o) => o.uniformKNm2 !== null);
  const imposedCode = $derived(loadCodeFor(loadsBinding?.adapterId));
  const reductionRefused = $derived(caseReductionRefusal(lc.type, holdsGeneratorReducedLoads(modelStore.loads, lc.id, loadsBinding?.settings as Record<string, unknown> | undefined)));
  const reductionPreview = $derived.by(() => {
    const a = area, f = parseDecimal(floors);
    if (!imposedCode || imposedCode.role !== 'loads' || a === null || f === null) return null;
    const r = caseReduction(imposedCode, { occupancy: imposedCode.occupancy(occupancyKey), tributaryAreaM2: a, elementKind: kind as ElementKind, floorsSupported: f });
    return r && { ...r, area: a, floors: Math.max(1, Math.round(f)) };
  });
  const KINDS = ['interiorColumn', 'exteriorColumnNoCantilever', 'edgeColumnWithCantilever', 'cornerColumnWithCantilever', 'edgeBeamNoCantilever', 'interiorBeam', 'other'];

  // ── Spectral ──
  const spectra = $derived(modelStore.model.dynamics?.spectra ?? []);
  /** γr/R from the project's seismic regulation (`store/spectral-cases.ts`). */
  const codeScale = codeSpectrumScale;
  /**
   * The regulation's γr/R when this case, on the code's spectrum, states another: the scale was
   * written when the case was ticked, and a change of the regulation since does not reach it.
   */
  const staleScale = $derived(lc.spectral ? staleCodeScale(lc.spectral) : null);
  function setSpectral(patch: Partial<SpectralCaseDef> | null) {
    if (patch === null) { update({ spectral: undefined }); return; }
    const base: SpectralCaseDef = lc.spectral ?? { source: { kind: 'code' }, factors: { x: 1, y: 0, z: 0 }, rule: 'cqc', xi: 0.05, scale: codeScale() };
    update({ spectral: { ...base, ...patch } });
  }
  const num = (s: string) => parseDecimal(s);
</script>

<div class="cd" data-testid="case-details-{lc.id}">
  {#if looped}<p class="cd-warn" data-testid="cd-loop">{t('caseDetails.loop')}</p>{/if}
  <div class="cd-row">
    <label><input type="checkbox" checked={!!lc.reference} onchange={(e) => update({ reference: e.currentTarget.checked })} data-testid="cd-reference" /> {t('caseDetails.reference')}</label>
    <label><input type="checkbox" checked={lc.solve !== false && !lc.reference} disabled={!!lc.reference} onchange={(e) => update({ solve: e.currentTarget.checked })} data-testid="cd-solve" /> {t('caseDetails.solve')}</label>
  </div>

  <div class="cd-title">{t('caseDetails.includes')}</div>
  {#each includes as inc, i (i)}
    <div class="cd-row">
      <!-- A refused change is put back: the field showed a value the case never took. -->
      <select value={inc.caseId} onchange={(e) => { if (!setInclude(i, { caseId: Number(e.currentTarget.value) })) e.currentTarget.value = String(inc.caseId); }} data-testid="cd-inc-case-{i}">
        {#each choicesFor(inc.caseId) as c (c.id)}<option value={c.id}>{c.type ? `${c.type} · ` : ''}{c.name}</option>{/each}
      </select>
      <span>×</span>
      <input type="text" class="cd-num" value={String(inc.factor)} onchange={(e) => { const v = parseDecimal(e.currentTarget.value); if (v === null || !setInclude(i, { factor: v })) e.currentTarget.value = String(inc.factor); }} data-testid="cd-inc-factor-{i}" />
      <button class="cd-x" onclick={() => update({ includes: includes.filter((_, k) => k !== i) })} aria-label={t('loadTables.delete')}>×</button>
    </div>
  {/each}
  <button class="pk-btn" onclick={addInclude} disabled={!takeable.length} data-testid="cd-inc-add">+ {t('caseDetails.addInclude')}</button>
  <Hint text={t('caseDetails.includesHint')} />
  {#if typedComposite}
    <p class="cd-warn" data-testid="cd-composite-typed">{tp('caseDetails.compositeTyped', { type: lc.type })}
      <button class="pk-btn" onclick={() => modelStore.updateLoadCaseType(lc.id, '')} data-testid="cd-composite-untype">{t('caseDetails.compositeUntype')}</button></p>
  {/if}

  <div class="cd-title">{t('caseDetails.alternatives')}</div>
  <div class="cd-row">
    <label>{t('caseDetails.group')} <input type="text" class="cd-wide" value={lc.alternatives ?? ''} onchange={(e) => update({ alternatives: e.currentTarget.value.trim() || undefined })} data-testid="cd-alt" /></label>
    <label><input type="checkbox" checked={!!lc.pattern} onchange={(e) => update({ pattern: e.currentTarget.checked })} data-testid="cd-pattern" /> {t('caseDetails.pattern')}</label>
  </div>
  <Hint text={t('caseDetails.alternativesHint')} />

  {#if (lc.type ?? '').toUpperCase() === 'N' || notional}
    <div class="cd-title">{t('caseDetails.notional')}</div>
    <div class="cd-row">
      <label>{t('caseDetails.source')}
        <select value={notional?.sourceCaseId ?? ''} onchange={(e) => { if (!setNotional({ sourceCaseId: Number(e.currentTarget.value) })) e.currentTarget.value = String(notional?.sourceCaseId ?? ''); }} data-testid="cd-not-source">
          {#if !notional}<option value="">—</option>{/if}
          {#each sources as c (c.id)}<option value={c.id}>{c.type ? `${c.type} · ` : ''}{c.name}</option>{/each}
        </select>
      </label>
      <label>{t('caseDetails.ratio')} <input type="text" class="cd-num" value={String(notional?.ratio ?? 0.002)} onchange={(e) => { const v = parseDecimal(e.currentTarget.value); if (v === null || !setNotional({ ratio: v })) e.currentTarget.value = String(notional?.ratio ?? 0.002); }} data-testid="cd-not-ratio" /></label>
      <select value={notional?.dir ?? '+X'} onchange={(e) => { if (!setNotional({ dir: e.currentTarget.value as '+X' })) e.currentTarget.value = notional?.dir ?? '+X'; }} data-testid="cd-not-dir">
        {#each ['+X', '-X', '+Y', '-Y'] as d (d)}<option value={d}>{signedAxisText(d)}</option>{/each}
      </select>
    </div>
    <Hint text={t('caseDetails.notionalHint')} />
  {/if}

  {#if (lc.type ?? '').toUpperCase() === 'E'}
    <div class="cd-title">{t('spectralCase.title')}</div>
    <label><input type="checkbox" checked={!!lc.spectral} onchange={(e) => setSpectral(e.currentTarget.checked ? {} : null)} data-testid="cd-spec-on" /> {t('spectralCase.on')}</label>
    {#if lc.spectral}
      {@const sp = lc.spectral}
      <div class="cd-row">
        <select value={sp.source.kind === 'code' ? 'code' : String(sp.source.spectrumId)} onchange={(e) => setSpectral({ source: e.currentTarget.value === 'code' ? { kind: 'code' } : { kind: 'user', spectrumId: Number(e.currentTarget.value) }, ...(e.currentTarget.value === 'code' ? { scale: codeScale() } : {}) })} data-testid="cd-spec-source">
          <option value="code">INPRES-CIRSOC 103</option>
          {#each spectra as s (s.id)}<option value={String(s.id)}>{s.name}</option>{/each}
        </select>
        <select value={sp.rule} onchange={(e) => setSpectral({ rule: e.currentTarget.value as 'cqc' })} data-testid="cd-spec-rule">
          <option value="cqc">CQC</option><option value="srss">SRSS</option><option value="abs">ABS</option>
        </select>
        <label>ξ <input type="text" class="cd-num" value={String(sp.xi)} onchange={(e) => { const v = num(e.currentTarget.value); if (v !== null) setSpectral({ xi: v }); }} /></label>
        <label>{t('spectralCase.scale')} <input type="text" class="cd-num" value={String(sp.scale)} onchange={(e) => { const v = num(e.currentTarget.value); if (v !== null) setSpectral({ scale: v }); }} data-testid="cd-spec-scale" /></label>
      </div>
      <div class="cd-row">
        {#each ['x', 'y', 'z'] as u, ui (u)}
          {@const a = 'xyz'[modelIndexOfUser(ui)]!}
          <label>{u.toUpperCase()} <input type="text" class="cd-num" value={String(sp.factors[a as 'x'])} onchange={(e) => { const v = num(e.currentTarget.value); if (v !== null) setSpectral({ factors: { ...sp.factors, [a]: v } }); }} data-testid="cd-spec-f{u}" /></label>
        {/each}
        <!-- How the directions add, quantity by quantity (`spectral-case.ts` `directionCombine`). -->
        <label>{t('spectralCase.directions')}
          <select value={sp.directions ?? 'percentage'} onchange={(e) => setSpectral({ directions: e.currentTarget.value as 'percentage' | 'srss' })} data-testid="cd-spec-directions">
            <option value="percentage">{t('spectralCase.directions.percentage')}</option>
            <option value="srss">{t('spectralCase.directions.srss')}</option>
          </select>
        </label>
      </div>
      {#if staleScale !== null}
        <p class="cd-warn" data-testid="cd-spec-scale-stale">{tp('spectralCase.scaleStale', { name: lc.name, scale: sp.scale, code: staleScale })}
          <button class="pk-btn" onclick={() => setSpectral({ scale: staleScale! })} data-testid="cd-spec-scale-use">{tp('spectralCase.scaleUse', { code: staleScale })}</button></p>
      {/if}
      <Hint text={t('spectralCase.hint')} />
    {/if}
  {/if}

  {#if reductionRefused !== 'notImposed' || lc.reduction}
    <div class="cd-title">{t('caseDetails.reduction')}</div>
    {#if reductionRefused === 'generatorReduced'}
      <p class="cd-warn" data-testid="cd-red-generated">{t('caseDetails.reductionGenerated')}</p>
    {/if}
    <!-- Retyped from L, the case keeps the ratio it states, and the solve does not apply it
         (`case-effects.ts` `reductionApplies`). -->
    {#if lc.reduction && reductionRefused === 'notImposed'}
      <p class="cd-warn" data-testid="cd-red-inactive">{t('caseDetails.reductionInactive')}</p>
    {/if}
    <div class="cd-row">
      <label>{t('caseDetails.reductionOccupancy')}
        <select bind:value={occupancyKey} class="cd-wide" data-testid="cd-red-occupancy">
          {#each occupancies as o (o.key)}<option value={o.key}>{t(o.labelKey)} · {o.uniformKNm2} kN/m²</option>{/each}
        </select>
      </label>
      <select bind:value={kind} data-testid="cd-red-kind">
        {#each KINDS as k (k)}<option value={k}>{t(`autoLoad.elementKind.${k}`)}</option>{/each}
      </select>
      <label>A<sub>T</sub> <QuantityInput bind:value={area} nullable quantity="planArea" cls="cd-num" testid="cd-red-area" /></label>
      <label>{t('autoLoad.floorsSupported')} <input type="text" class="cd-num" bind:value={floors} data-testid="cd-red-floors" /></label>
    </div>
    {#if reductionPreview}
      <p class="cd-hint" data-testid="cd-red-preview">{tp('caseDetails.reductionRatio', { r: reductionPreview.ratio.toFixed(3) })} {tp('caseDetails.reductionLo', { lo: reductionPreview.lo })} {te(reductionPreview.reason)}</p>
    {/if}
    <div class="cd-row">
      <button class="pk-btn" disabled={!reductionPreview || reductionRefused !== null} onclick={() => reductionPreview && update({ reduction: { ratio: reductionPreview.ratio, tributaryAreaM2: reductionPreview.area, elementKind: kind, floorsSupported: reductionPreview.floors, occupancyKey } })} data-testid="cd-red-apply">{t('caseDetails.reductionApply')}</button>
      {#if lc.reduction}<button class="pk-btn" onclick={() => update({ reduction: undefined })} data-testid="cd-red-clear">{t('caseDetails.reductionClear')}</button>
        <span class="cd-hint">{tp('caseDetails.reductionOn', { r: lc.reduction.ratio.toFixed(3) })}</span>{/if}
    </div>
  {/if}
</div>

<style>
  .cd { display: flex; flex-direction: column; gap: 4px; padding: 6px 4px 8px 18px; font-size: 0.68rem; color: var(--st-text-2); }
  .cd-title { font-size: 0.64rem; font-weight: 600; color: var(--st-text); margin-top: 4px; }
  .cd-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
  .cd-row label { display: inline-flex; align-items: center; gap: 4px; }
  .cd :global(.cd-num) { width: 56px; font-family: var(--st-mono); }
  .cd-wide { width: 110px; }
  .cd-hint { margin: 0; font-size: 0.6rem; color: var(--st-text-3); line-height: 1.35; }
  .cd-warn { margin: 0; font-size: 0.62rem; color: var(--st-warn); line-height: 1.35; }
  .cd-x { background: none; border: none; color: var(--st-text-3); cursor: pointer; }
  .cd-x:hover { color: var(--st-danger); }
</style>
