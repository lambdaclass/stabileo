<script lang="ts">
  /**
   * One case's composition and how it is solved (`engine/case-effects.ts`,
   * `engine/combination-methods.ts`): the cases it takes in with their factors, whether it is a
   * reference or solved on its own, its alternatives group and pattern, its notional loads and its
   * reduction. Each change is one undo step.
   */
  import { modelStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { te } from '../../../lib/i18n/engine-text';
  import { parseDecimal } from '../../../lib/utils/numeric-input';
  import { caseOrder } from '../../../lib/engine/case-effects';
  import { loadCodeFor } from '../../../lib/codes/families';
  import { regulationsStore } from '../../../lib/store/regulations.svelte';
  import type { LoadCase } from '../../../lib/store/model.svelte';
  import type { SpectralCaseDef } from '../../../lib/engine/spectral-case';
  import { RISK_FACTOR } from '../../../lib/codes/cirsoc103/spectrum';
  import { findBehaviour, R_ELASTIC } from '../../../lib/codes/cirsoc103/behaviour';

  interface Props { lc: LoadCase }
  let { lc }: Props = $props();

  const cases = $derived(modelStore.model.loadCases);
  const update = (patch: Parameters<typeof modelStore.updateLoadCaseFields>[1]) => modelStore.updateLoadCaseFields(lc.id, patch);

  // ── Taken in ──
  const includes = $derived(lc.includes ?? []);
  /** The cases this one can take in: not itself, nor any that would bring it back. */
  const takeable = $derived(cases.filter((c) => c.id !== lc.id && !caseOrder(cases.map((x) => (x.id === lc.id ? { ...x, includes: [...(x.includes ?? []), { caseId: c.id, factor: 1 }] } : x))).looped.has(lc.id)));
  function setInclude(i: number, patch: Partial<{ caseId: number; factor: number }>) {
    update({ includes: includes.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  }
  function addInclude() {
    const first = takeable.find((c) => !includes.some((x) => x.caseId === c.id));
    if (first) update({ includes: [...includes, { caseId: first.id, factor: 1 }] });
  }

  // ── Notional ──
  const notional = $derived(lc.notional);
  function setNotional(patch: Partial<NonNullable<LoadCase['notional']>>) {
    const base = notional ?? { sourceCaseId: cases.find((c) => c.id !== lc.id)?.id ?? lc.id, ratio: 0.002, dir: '+X' as const };
    update({ notional: { ...base, ...patch } });
  }

  // ── Reduction ──
  let area = $state(String(lc.reduction?.tributaryAreaM2 ?? ''));
  let kind = $state(lc.reduction?.elementKind ?? 'interiorBeam');
  let floors = $state(String(lc.reduction?.floorsSupported ?? 1));
  const imposedCode = $derived(loadCodeFor(regulationsStore.binding('loads')?.adapterId));
  const reductionPreview = $derived.by(() => {
    const a = parseDecimal(area), f = parseDecimal(floors);
    if (!imposedCode || imposedCode.role !== 'loads' || a === null || !(a > 0) || f === null) return null;
    const r = imposedCode.reduce({ loKNm2: 1, tributaryAreaM2: a, elementKind: kind as never, floorsSupported: Math.max(1, Math.round(f)), passengerGarage: false, publicAssembly: false, noReduction: false });
    return { ratio: r.lKNm2, reason: r.reason, area: a, floors: Math.max(1, Math.round(f)) };
  });
  const KINDS = ['interiorColumn', 'exteriorColumnNoCantilever', 'edgeColumnWithCantilever', 'cornerColumnWithCantilever', 'edgeBeamNoCantilever', 'interiorBeam', 'other'];
  const isImposed = $derived(['L', 'LR', 'CR', 'TR'].includes((lc.type ?? '').toUpperCase()));

  // ── Spectral ──
  const spectra = $derived(modelStore.model.dynamics?.spectra ?? []);
  /** γr/R from the project's seismic regulation: the code spectrum's own scale. */
  function codeScale(): number {
    const s = regulationsStore.binding('seismic')?.settings as { destinationGroup?: string; systemKey?: string; elastic?: boolean } | undefined;
    const gr = RISK_FACTOR[(s?.destinationGroup ?? 'B') as keyof typeof RISK_FACTOR] ?? 1;
    const r = s?.elastic ? R_ELASTIC : s?.systemKey ? findBehaviour(s.systemKey)?.r ?? 1 : 1;
    return +(gr / r).toFixed(4);
  }
  function setSpectral(patch: Partial<SpectralCaseDef> | null) {
    if (patch === null) { update({ spectral: undefined }); return; }
    const base: SpectralCaseDef = lc.spectral ?? { source: { kind: 'code' }, factors: { x: 1, y: 0, z: 0 }, rule: 'cqc', xi: 0.05, scale: codeScale() };
    update({ spectral: { ...base, ...patch } });
  }
  const num = (s: string) => parseDecimal(s);
</script>

<div class="cd" data-testid="case-details-{lc.id}">
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
          {#each cases.filter((c) => c.id !== lc.id) as c (c.id)}<option value={c.id}>{c.type ? `${c.type} · ` : ''}{c.name}</option>{/each}
        </select>
      </label>
      <label>{t('caseDetails.ratio')} <input type="text" class="cd-num" value={String(notional?.ratio ?? 0.002)} onchange={(e) => { const v = parseDecimal(e.currentTarget.value); if (v !== null) setNotional({ ratio: v }); }} data-testid="cd-not-ratio" /></label>
      <select value={notional?.dir ?? '+X'} onchange={(e) => setNotional({ dir: e.currentTarget.value as '+X' })} data-testid="cd-not-dir">
        {#each ['+X', '-X', '+Y', '-Y'] as d (d)}<option value={d}>{d}</option>{/each}
      </select>
    </div>
    <p class="cd-hint">{t('caseDetails.notionalHint')}</p>
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
        {#each ['x', 'y', 'z'] as a (a)}
          <label>{a.toUpperCase()} <input type="text" class="cd-num" value={String(sp.factors[a as 'x'])} onchange={(e) => { const v = num(e.currentTarget.value); if (v !== null) setSpectral({ factors: { ...sp.factors, [a]: v } }); }} data-testid="cd-spec-f{a}" /></label>
        {/each}
      </div>
      <p class="cd-hint">{t('spectralCase.hint')}</p>
    {/if}
  {/if}

  {#if isImposed}
    <div class="cd-title">{t('caseDetails.reduction')}</div>
    <div class="cd-row">
      <select bind:value={kind} data-testid="cd-red-kind">
        {#each KINDS as k (k)}<option value={k}>{t(`autoLoad.elementKind.${k}`)}</option>{/each}
      </select>
      <label>A<sub>T</sub> <input type="text" class="cd-num" bind:value={area} data-testid="cd-red-area" /> m²</label>
      <label>{t('autoLoad.floorsSupported')} <input type="text" class="cd-num" bind:value={floors} data-testid="cd-red-floors" /></label>
    </div>
    {#if reductionPreview}
      <p class="cd-hint" data-testid="cd-red-preview">{tp('caseDetails.reductionRatio', { r: reductionPreview.ratio.toFixed(3) })} {te(reductionPreview.reason)}</p>
    {/if}
    <div class="cd-row">
      <button class="pk-btn" disabled={!reductionPreview} onclick={() => reductionPreview && update({ reduction: { ratio: reductionPreview.ratio, tributaryAreaM2: reductionPreview.area, elementKind: kind, floorsSupported: reductionPreview.floors } })} data-testid="cd-red-apply">{t('caseDetails.reductionApply')}</button>
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
  .cd-x { background: none; border: none; color: var(--st-text-3); cursor: pointer; }
  .cd-x:hover { color: var(--st-danger); }
</style>
