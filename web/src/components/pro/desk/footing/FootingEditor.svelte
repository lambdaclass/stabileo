<script lang="ts">
  /**
   * The footing editor: the footings in a list, the selected one's geometry and ground, its locks,
   * sizing in three modes, its design as a rigid base (or on its piles) with every check, its mats
   * editable bar by bar (which fixes them), the bar schedule, the soil pressure with a point query,
   * the drawing in plan and section, and the way to its bars in 3D. Overlapping footings are listed
   * and can be made one combined footing.
   */
  import { t, tp } from '../../../../lib/i18n';
  import { modelStore } from '../../../../lib/store';
  import { detailingStore } from '../../../../lib/store/detailing.svelte';
  import { openRebar3DView } from '../../../../lib/store/rebar-open';
  import { footingDesignInput, sizeModelFootings, modelFootingOverlaps, resolveFootingOverlaps } from '../../../../lib/store/footing-sizing';
  import { designGeneralFooting, type MatLayer } from '../../../../lib/engine/foundation/general-footing';
  import type { SizingMode } from '../../../../lib/engine/foundation/sizing';
  import { SUPPORTED_MAT_DIAMETERS_MM } from '../../../../lib/model/footing';
  import type { FootingMats } from '../../../../lib/model/foundation/locks';
  import FootingGeometryFields from '../../design/FootingGeometryFields.svelte';
  import FootingPressureMap from './FootingPressureMap.svelte';
  import FootingDrawing from './FootingDrawing.svelte';

  const footings = $derived([...modelStore.model.footings.values()].sort((a, b) => a.id - b.id));
  let sel = $state<number | null>(null);
  $effect(() => { if (!footings.some((f) => f.id === sel)) sel = footings[0]?.id ?? null; });
  const f = $derived(footings.find((x) => x.id === sel) ?? null);
  const input = $derived(f && f.B > 0 && f.L > 0 ? footingDesignInput(f) : null);
  const design = $derived(input ? designGeneralFooting(input) : null);
  const ok = $derived(design && !('refused' in design) ? design : null);
  const sizes = $derived(ok && input ? ok.posts.map((p) => {
    if (f!.kind === 'strip') return { cx: input.wallThickness ?? 0.2, cy: input.wallThickness ?? 0.2 };
    const c = input.columnAt(p.nodeId);
    return { cx: c?.b ?? 0.3, cy: c?.h ?? 0.3 };
  }) : []);
  const run = $derived(detailingStore.lastFootingRun?.outcomes.find((o) => o.footingId === f?.id) ?? null);
  const overlaps = $derived.by(() => { void modelStore.model.footings; return modelFootingOverlaps(); });
  let note = $state<string | null>(null);
  let all = $state(false);

  function size(mode: SizingMode) {
    if (!f) return;
    const r = sizeModelFootings(mode, all ? undefined : [f.id]);
    const grown = r.filter((x) => Object.keys(x.result.size).length > 0).length;
    const short = r.filter((x) => x.result.reason === 'limit' || x.result.reason === 'refused').map((x) => x.name);
    const locked = r.filter((x) => x.result.reason === 'locked').length;
    note = tp('fdnEd.sized', { n: grown, of: r.length, locked }) + (short.length ? ` ${tp('fdnEd.notReached', { names: short.join(', ') })}` : '');
  }

  type LayerKey = 'bottomX' | 'bottomY' | 'topX' | 'topY';
  const LAYERS: LayerKey[] = ['bottomX', 'bottomY', 'topX', 'topY'];
  const spec = (l: MatLayer | null) => (l ? { diameterMm: l.diameterMm, spacing: l.spacing } : undefined);
  function fix(key: LayerKey, change: { diameterMm?: number; spacing?: number }) {
    if (!f || !ok) return;
    const cur: Record<LayerKey, { diameterMm: number; spacing: number } | undefined> = {
      bottomX: spec(ok.mats.bottomX), bottomY: spec(ok.mats.bottomY), topX: spec(ok.mats.topX), topY: spec(ok.mats.topY),
    };
    const base = cur[key] ?? { diameterMm: 12, spacing: 0.2 };
    cur[key] = { ...base, ...change };
    const mats: FootingMats = { bottomX: cur.bottomX!, bottomY: cur.bottomY!, ...(cur.topX ? { topX: cur.topX } : {}), ...(cur.topY ? { topY: cur.topY } : {}) };
    modelStore.updateFooting(f.id, { mats, locked: { ...f.locked, reinforcement: true } });
  }
  const unfix = () => f && modelStore.updateFooting(f.id, { mats: undefined, locked: { ...f.locked, reinforcement: false } });
  const lock = (k: 'dimensions' | 'reinforcement', v: boolean) => f && modelStore.updateFooting(f.id, { locked: { ...f.locked, [k]: v } });

  const area = (l: MatLayer | null) => (l ? (l.area * 1e4).toFixed(2) : '—');
  const schedule = $derived.by(() => {
    if (!ok) return [];
    const by = new Map<string, { layer: string; n: number; d: number; len: number }>();
    for (const b of ok.bars) {
      const layer = b.id.split('-')[1]!;
      const r = by.get(layer) ?? { layer, n: 0, d: b.diameterMm, len: b.cuttingLength };
      r.n++; by.set(layer, r);
    }
    return [...by.values()].map((r) => ({ ...r, total: r.n * r.len, kg: r.n * r.len * 0.00617 * r.d * r.d }));
  });
  type Row = { key: string; label: string; u: number; detail: string };
  const rows = $derived.by((): Row[] => {
    if (!ok) return [];
    if ('cap' in ok.result) {
      const c = ok.result.cap;
      return [
        { key: 'piles', label: t('fdnEd.check.piles'), u: c.piles.tension ? Infinity : c.piles.utilization, detail: `${c.piles.max.toFixed(0)} / ${c.piles.capacity.toFixed(0)} kN` },
        { key: 'shearX', label: t('fdnEd.check.shearX'), u: c.x.shear.utilization, detail: `${c.x.shear.vu.toFixed(0)} / ${c.x.shear.phiVc.toFixed(0)} kN` },
        { key: 'shearY', label: t('fdnEd.check.shearY'), u: c.y.shear.utilization, detail: `${c.y.shear.vu.toFixed(0)} / ${c.y.shear.phiVc.toFixed(0)} kN` },
        { key: 'punch', label: t('fdnEd.check.punching'), u: c.punching.column, detail: '' },
        { key: 'corner', label: t('fdnEd.check.cornerPile'), u: c.punching.cornerPile, detail: '' },
        { key: 'flex', label: t('fdnEd.check.flexure'), u: ok.flexure, detail: '' },
      ];
    }
    const r = ok.result.rigid;
    return [
      { key: 'bearing', label: t('fdnEd.check.bearing'), u: r.bearing.ok ? r.bearing.utilization : Math.max(r.bearing.utilization, 1.0001), detail: `${r.bearing.qMax.toFixed(0)} / ${r.bearing.allowable.toFixed(0)} kPa · ${(r.bearing.contact * 100).toFixed(0)} %` },
      { key: 'shearX', label: t('fdnEd.check.shearX'), u: r.x.shear.utilization, detail: `${r.x.shear.vu.toFixed(0)} / ${r.x.shear.phiVc.toFixed(0)} kN` },
      { key: 'shearY', label: t('fdnEd.check.shearY'), u: r.y.shear.utilization, detail: `${r.y.shear.vu.toFixed(0)} / ${r.y.shear.phiVc.toFixed(0)} kN` },
      ...r.punching.map((p) => ({ key: `p-${p.postId}`, label: tp('fdnEd.check.punchingAt', { post: p.postId }), u: p.utilization, detail: '' })),
      { key: 'flex', label: t('fdnEd.check.flexure'), u: ok.flexure, detail: `M+ ${Math.max(r.x.mPos, r.y.mPos).toFixed(0)} · M− ${Math.min(r.x.mNeg, r.y.mNeg).toFixed(0)} kN·m` },
      { key: 'over', label: t('fdnEd.check.overturning'), u: r.overturns ? Infinity : 0, detail: '' },
    ];
  });
  const fmtU = (u: number) => (Number.isFinite(u) ? u.toFixed(2) : '∞');
</script>

<div class="fe" data-testid="footing-desk-editor">
  {#if footings.length === 0}
    <p class="fe-hint">{t('fdnEd.none')}</p>
  {:else}
    <div class="fe-cols">
      <ul class="fe-list" role="listbox" aria-label={t('fdnEd.list')}>
        {#each footings as x (x.id)}
          <li><button role="option" aria-selected={x.id === sel} class:on={x.id === sel} onclick={() => (sel = x.id)} data-testid="fdn-ed-{x.id}">
            {x.name || `F${x.id}`} <span class="fe-kind">{t(`fdn.kind.${x.kind}`)}</span>{#if x.locked?.dimensions || x.locked?.reinforcement}<span class="fe-lock" title={t('fdnEd.locked')}>●</span>{/if}
          </button></li>
        {/each}
      </ul>
      {#if f}
        <div class="fe-main">
          <section class="fe-card">
            <h5>{t('fdnEd.geometry')}</h5>
            <FootingGeometryFields footing={f} />
            <div class="fe-row">
              <label><input type="checkbox" checked={!!f.locked?.dimensions} onchange={(e) => lock('dimensions', e.currentTarget.checked)} data-testid="fdn-lock-dims" /> {t('fdnEd.lockDims')}</label>
              <label><input type="checkbox" checked={!!f.locked?.reinforcement} onchange={(e) => lock('reinforcement', e.currentTarget.checked)} data-testid="fdn-lock-rebar" /> {t('fdnEd.lockRebar')}</label>
            </div>
            <div class="fe-row">
              <span class="fe-sub">{t('fdnEd.size')}</span>
              <button onclick={() => size('full')} data-testid="fdn-size-full">{t('fdnEd.mode.full')}</button>
              <button onclick={() => size('minimum')} data-testid="fdn-size-min">{t('fdnEd.mode.minimum')}</button>
              <button onclick={() => size('reinforce')} data-testid="fdn-size-rebar">{t('fdnEd.mode.reinforce')}</button>
              <label><input type="checkbox" bind:checked={all} /> {t('fdnEd.allFootings')}</label>
            </div>
            {#if note}<p class="fe-hint" role="status" data-testid="fdn-size-note">{note}</p>{/if}
            {#if overlaps.pairs.length > 0}
              <p class="fe-warn" data-testid="fdn-overlaps">{tp('fdnEd.overlaps', { n: overlaps.pairs.length, list: overlaps.pairs.map((p) => `${modelStore.model.footings.get(p.a)?.name}–${modelStore.model.footings.get(p.b)?.name}`).join(', ') })}
                <button onclick={() => { note = tp('fdnEd.combined', { n: resolveFootingOverlaps().length }); }} data-testid="fdn-resolve-overlaps">{t('fdnEd.combine')}</button></p>
            {/if}
          </section>

          {#if design && 'refused' in design}
            <p class="fe-warn">{tp(`footing.general.${design.refused}`, { footing: f.name })}</p>
          {:else if ok}
            <section class="fe-card">
              <h5>{t('fdnEd.checks')} <span class="fe-sub">{tp('fdnEd.governing', { c: ok.governing })}</span>
                {#if run?.record}<span class="fe-sub">· {tp('fdnEd.runStatus', { s: run.record.status })}</span>{/if}</h5>
              <table class="fe-t" data-testid="fdn-checks">
                <tbody>
                  {#each rows as r (r.key)}
                    <tr class:bad={r.u > 1 + 1e-9}><td>{r.label}</td><td class="num">{fmtU(r.u)}</td><td class="fe-sub">{r.detail}</td></tr>
                  {/each}
                </tbody>
              </table>
            </section>

            <section class="fe-card">
              <h5>{t('fdnEd.rebar')} {#if f.mats}<button onclick={unfix} data-testid="fdn-unfix">{t('fdnEd.unfix')}</button>{/if}</h5>
              <table class="fe-t" data-testid="fdn-mats">
                <thead><tr><th></th><th>Ø</th><th>s</th><th>{t('fdnEd.required')}</th><th>{t('fdnEd.provided')}</th></tr></thead>
                <tbody>
                  {#each LAYERS as k (k)}
                    {@const l = ok.mats[k]}
                    <tr>
                      <td>{t(`fdnEd.layer.${k}`)}</td>
                      <td><select value={l?.diameterMm ?? ''} onchange={(e) => fix(k, { diameterMm: +e.currentTarget.value })} aria-label={t('fdnEd.diameter')}>
                        {#if !l}<option value="">—</option>{/if}
                        {#each SUPPORTED_MAT_DIAMETERS_MM as d (d)}<option value={d}>Ø{d}</option>{/each}</select></td>
                      <td><input type="number" min="0.075" max="0.45" step="0.025" value={l?.spacing ?? ''} onchange={(e) => fix(k, { spacing: +e.currentTarget.value })} aria-label={t('fdnEd.spacing')} /></td>
                      <td class="num">{l ? (l.required * 1e4).toFixed(2) : '—'}</td>
                      <td class="num" class:bad={!!l && l.area < l.required - 1e-12}>{area(l)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
              <h6>{t('fdnEd.schedule')}</h6>
              <table class="fe-t" data-testid="fdn-schedule">
                <thead><tr><th></th><th>n</th><th>Ø</th><th>L (m)</th><th>ΣL (m)</th><th>kg</th></tr></thead>
                <tbody>
                  {#each schedule as s (s.layer)}<tr><td>{s.layer}</td><td class="num">{s.n}</td><td class="num">{s.d}</td><td class="num">{s.len.toFixed(2)}</td><td class="num">{s.total.toFixed(1)}</td><td class="num">{s.kg.toFixed(1)}</td></tr>{/each}
                  <tr class="fe-sum"><td>Σ</td><td class="num">{schedule.reduce((a, s) => a + s.n, 0)}</td><td></td><td></td><td class="num">{schedule.reduce((a, s) => a + s.total, 0).toFixed(1)}</td><td class="num">{schedule.reduce((a, s) => a + s.kg, 0).toFixed(1)}</td></tr>
                </tbody>
              </table>
            </section>

            <section class="fe-card fe-views">
              <div><h6>{t('fdnEd.pressureMap')}</h6><FootingPressureMap footing={f} design={ok} /></div>
              <div><h6>{t('fdnEd.drawing')}</h6><FootingDrawing footing={f} design={ok} {sizes} />
                <button disabled={detailingStore.assemblies.length === 0} title={detailingStore.assemblies.length === 0 ? t('fdnEd.need3d') : ''}
                  onclick={() => openRebar3DView({ elements: ok.bars.flatMap((b) => b.ownerElementIds), families: ['footing'] })} data-testid="fdn-open-3d">{t('desk.rebar3d')}</button></div>
            </section>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .fe { font-size: 0.74rem; }
  .fe-cols { display: grid; grid-template-columns: minmax(8rem, 11rem) 1fr; gap: 8px; }
  @media (max-width: 640px) { .fe-cols { grid-template-columns: 1fr; } }
  .fe-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; max-height: 70vh; overflow: auto; }
  .fe-list button { width: 100%; text-align: left; padding: 3px 6px; border: 1px solid transparent; border-radius: 3px; background: none; color: inherit; font: inherit; cursor: pointer; }
  .fe-list button.on { border-color: var(--st-interactive); background: var(--st-surface-3); }
  .fe-kind { color: var(--st-text-2); font-size: 0.66rem; }
  .fe-lock { color: var(--st-warn); margin-left: 4px; font-size: 0.6rem; }
  .fe-main { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .fe-card { background: var(--st-surface-2); border: 1px solid var(--st-surface-3); border-radius: 4px; padding: 6px 8px; }
  h5 { margin: 0 0 4px; font-size: 0.74rem; color: var(--st-info); display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  h6 { margin: 6px 0 2px; font-size: 0.68rem; color: var(--st-text-2); }
  .fe-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 6px; }
  .fe-sub { color: var(--st-text-2); font-size: 0.66rem; font-weight: 400; }
  .fe-hint { color: var(--st-text-2); margin: 4px 0 0; }
  .fe-warn { color: var(--st-warn); margin: 6px 0 0; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .fe-t { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
  .fe-t td, .fe-t th { padding: 1px 4px; border-bottom: 1px solid var(--st-surface-3); text-align: left; font-weight: 400; }
  .fe-t .num { text-align: right; }
  .fe-t tr.bad td, .fe-t td.bad { color: var(--st-danger); font-weight: 600; }
  .fe-sum td { font-weight: 600; }
  .fe-t input { width: 4.2rem; } .fe-t select { width: 4.4rem; }
  .fe-views { display: flex; gap: 12px; flex-wrap: wrap; }
  .fe-views > div { flex: 1 1 260px; min-width: 0; }
  button { font: inherit; cursor: pointer; padding: 1px 7px; border: 1px solid var(--st-hair-strong); border-radius: 4px; background: var(--st-surface-3); color: var(--st-text); font-size: 0.68rem; }
  button:disabled { opacity: 0.6; cursor: not-allowed; }
  button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
  input, select { font: inherit; padding: 1px 3px; background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: 3px; color: var(--st-text); }
</style>
