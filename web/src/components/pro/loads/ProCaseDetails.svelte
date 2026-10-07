<script lang="ts">
  /**
   * One case's composition and how it is solved (`engine/case-effects.ts`,
   * `engine/combination-methods.ts`): the cases it takes in with their factors, whether it is a
   * reference or solved on its own, its alternatives group and pattern, its notional loads and its
   * reduction. Each change is one undo step.
   *
   * Nothing here can make a case read itself: the cases offered to take in and as a notional
   * source leave out every one that would bring it back (the store refuses it too), and a case
   * already in a loop, from a file, says so. A composite case with a load type says that the
   * generator, the mass rules and the self-weight do not take it as one (`isCompositeCase`).
   */
  import { modelStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { te } from '../../../lib/i18n/engine-text';
  import { parseDecimal } from '../../../lib/utils/numeric-input';
  import { caseOrder } from '../../../lib/engine/case-effects';
  import { symbolOfType } from '../../../lib/engine/loads/combination-cases';
  import { caseReduction, caseReductionRefusal, holdsGeneratorReducedLoads } from '../../../lib/engine/loads/case-reduction';
  import { OCCUPANCY_TABLE_2025, type ElementKind } from '../../../lib/codes/cirsoc101/live-loads';
  import { loadCodeFor } from '../../../lib/codes/families';
  import { regulationsStore } from '../../../lib/store/regulations.svelte';
  import type { LoadCase } from '../../../lib/store/model.svelte';

  interface Props { lc: LoadCase }
  let { lc }: Props = $props();

  const cases = $derived(modelStore.model.loadCases);
  const update = (patch: Parameters<typeof modelStore.updateLoadCaseFields>[1]) => modelStore.updateLoadCaseFields(lc.id, patch);

  // ── Taken in ──
  const includes = $derived(lc.includes ?? []);
  /** The cases this one can take in: not itself, nor any that would bring it back. */
  const takeable = $derived(cases.filter((c) => c.id !== lc.id && !caseOrder(cases.map((x) => (x.id === lc.id ? { ...x, includes: [...(x.includes ?? []), { caseId: c.id, factor: 1 }] } : x))).looped.has(lc.id)));
  /** Already in a loop (a file can hold one): solved, it takes nothing in. */
  const looped = $derived(caseOrder(cases).looped.has(lc.id));
  /** A composite case with a load type: not taken as one (`combination-cases.ts` `isCompositeCase`). */
  const typedComposite = $derived(includes.length > 0 && symbolOfType(lc.type) !== null);
  function setInclude(i: number, patch: Partial<{ caseId: number; factor: number }>) {
    update({ includes: includes.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  }
  function addInclude() {
    const first = takeable.find((c) => !includes.some((x) => x.caseId === c.id));
    if (first) update({ includes: [...includes, { caseId: first.id, factor: 1 }] });
  }

  // ── Notional ──
  const notional = $derived(lc.notional);
  /** The cases this one can read its notional loads off: not itself, nor any that takes it in. */
  const sourceable = $derived(cases.filter((c) => c.id !== lc.id && !caseOrder(cases.map((x) => (x.id === lc.id ? { ...x, notional: { sourceCaseId: c.id, ratio: 1, dir: '+X' as const } } : x))).looped.has(lc.id)));
  function setNotional(patch: Partial<NonNullable<LoadCase['notional']>>) {
    // With no case to read, none: it fell back to the case itself, a loop of one.
    const source = notional?.sourceCaseId ?? sourceable[0]?.id;
    if (source === undefined && patch.sourceCaseId === undefined) return;
    const base = notional ?? { sourceCaseId: source!, ratio: 0.002, dir: '+X' as const };
    update({ notional: { ...base, ...patch } });
  }

  // ── Reduction (`engine/loads/case-reduction.ts`) ──
  const loadsBinding = $derived(regulationsStore.binding('loads'));
  let area = $state(String(lc.reduction?.tributaryAreaM2 ?? ''));
  let kind = $state(lc.reduction?.elementKind ?? 'interiorBeam');
  let floors = $state(String(lc.reduction?.floorsSupported ?? 1));
  // Lo and the row's exclusions: the occupancy stated, else the project's (the generator's).
  let occupancyKey = $state(lc.reduction?.occupancyKey ?? String((regulationsStore.binding('loads')?.settings as Record<string, unknown> | undefined)?.occupancyKey ?? 'vivienda'));
  const occupancies = OCCUPANCY_TABLE_2025.filter((o) => o.uniformKNm2 !== null);
  const imposedCode = $derived(loadCodeFor(loadsBinding?.adapterId));
  const reductionRefused = $derived(caseReductionRefusal(lc.type, holdsGeneratorReducedLoads(modelStore.loads, lc.id, loadsBinding?.settings as Record<string, unknown> | undefined)));
  const reductionPreview = $derived.by(() => {
    const a = parseDecimal(area), f = parseDecimal(floors);
    if (!imposedCode || imposedCode.role !== 'loads' || a === null || f === null) return null;
    const r = caseReduction(imposedCode, { occupancy: imposedCode.occupancy(occupancyKey), tributaryAreaM2: a, elementKind: kind as ElementKind, floorsSupported: f });
    return r && { ...r, area: a, floors: Math.max(1, Math.round(f)) };
  });
  const KINDS = ['interiorColumn', 'exteriorColumnNoCantilever', 'edgeColumnWithCantilever', 'cornerColumnWithCantilever', 'edgeBeamNoCantilever', 'interiorBeam', 'other'];
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
      <select value={inc.caseId} onchange={(e) => setInclude(i, { caseId: Number(e.currentTarget.value) })} data-testid="cd-inc-case-{i}">
        {#each takeable as c (c.id)}<option value={c.id}>{c.type ? `${c.type} · ` : ''}{c.name}</option>{/each}
      </select>
      <span>×</span>
      <input type="text" class="cd-num" value={String(inc.factor)} onchange={(e) => { const v = parseDecimal(e.currentTarget.value); if (v !== null) setInclude(i, { factor: v }); }} data-testid="cd-inc-factor-{i}" />
      <button class="cd-x" onclick={() => update({ includes: includes.filter((_, k) => k !== i) })} aria-label={t('loadTables.delete')}>×</button>
    </div>
  {/each}
  <button class="pk-btn" onclick={addInclude} disabled={!takeable.length} data-testid="cd-inc-add">+ {t('caseDetails.addInclude')}</button>
  <p class="cd-hint">{t('caseDetails.includesHint')}</p>
  {#if typedComposite}
    <p class="cd-warn" data-testid="cd-composite-typed">{tp('caseDetails.compositeTyped', { type: lc.type })}
      <button class="pk-btn" onclick={() => modelStore.updateLoadCaseType(lc.id, '')} data-testid="cd-composite-untype">{t('caseDetails.compositeUntype')}</button></p>
  {/if}

  <div class="cd-title">{t('caseDetails.alternatives')}</div>
  <div class="cd-row">
    <label>{t('caseDetails.group')} <input type="text" class="cd-wide" value={lc.alternatives ?? ''} onchange={(e) => update({ alternatives: e.currentTarget.value.trim() || undefined })} data-testid="cd-alt" /></label>
    <label><input type="checkbox" checked={!!lc.pattern} onchange={(e) => update({ pattern: e.currentTarget.checked })} data-testid="cd-pattern" /> {t('caseDetails.pattern')}</label>
  </div>
  <p class="cd-hint">{t('caseDetails.alternativesHint')}</p>

  {#if (lc.type ?? '').toUpperCase() === 'N' || notional}
    <div class="cd-title">{t('caseDetails.notional')}</div>
    <div class="cd-row">
      <label>{t('caseDetails.source')}
        <select value={notional?.sourceCaseId ?? ''} onchange={(e) => setNotional({ sourceCaseId: Number(e.currentTarget.value) })} data-testid="cd-not-source">
          {#if !notional}<option value="">—</option>{/if}
          {#each sourceable as c (c.id)}<option value={c.id}>{c.type ? `${c.type} · ` : ''}{c.name}</option>{/each}
        </select>
      </label>
      <label>{t('caseDetails.ratio')} <input type="text" class="cd-num" value={String(notional?.ratio ?? 0.002)} onchange={(e) => { const v = parseDecimal(e.currentTarget.value); if (v !== null) setNotional({ ratio: v }); }} data-testid="cd-not-ratio" /></label>
      <select value={notional?.dir ?? '+X'} onchange={(e) => setNotional({ dir: e.currentTarget.value as '+X' })} data-testid="cd-not-dir">
        {#each ['+X', '-X', '+Y', '-Y'] as d (d)}<option value={d}>{d}</option>{/each}
      </select>
    </div>
    <p class="cd-hint">{t('caseDetails.notionalHint')}</p>
  {/if}

  {#if reductionRefused !== 'notImposed' || lc.reduction}
    <div class="cd-title">{t('caseDetails.reduction')}</div>
    {#if reductionRefused === 'generatorReduced'}
      <p class="cd-warn" data-testid="cd-red-generated">{t('caseDetails.reductionGenerated')}</p>
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
      <label>A<sub>T</sub> <input type="text" class="cd-num" bind:value={area} data-testid="cd-red-area" /> m²</label>
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
  .cd-num { width: 56px; font-family: var(--st-mono); }
  .cd-wide { width: 110px; }
  .cd-hint { margin: 0; font-size: 0.6rem; color: var(--st-text-3); line-height: 1.35; }
  .cd-warn { margin: 0; font-size: 0.62rem; color: var(--st-warn); line-height: 1.35; }
  .cd-x { background: none; border: none; color: var(--st-text-3); cursor: pointer; }
  .cd-x:hover { color: var(--st-danger); }
</style>
