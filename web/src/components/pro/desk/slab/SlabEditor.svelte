<script lang="ts">
  /**
   * The slab editor: the panels the floor design produced; the selected one in plan with its
   * strips, its bands and the columns at its corners; its base mat and bands edited as a draft and
   * checked at once by strips (`checkPanel`); bands added, moved, resized, hooked, deleted, and
   * equalized over a rectangle or over the columns; saved with the decisions (the slabs designed
   * again) or sent back to the proposal.
   */
  import { untrack } from 'svelte';
  import SlabBandTools from './SlabBandTools.svelte';
  import { bandBars, bandOutline } from '../../../../lib/engine/detailing/slab-bands';
  import FamilyBatch from '../FamilyBatch.svelte';
  import { t, tp } from '../../../../lib/i18n';
  import { modelStore } from '../../../../lib/store';
  import { detailingStore } from '../../../../lib/store/detailing.svelte';
  import { storedDecisions } from '../../../../lib/store/design-decisions';
  import { checkPanel, equalizeBands } from '../../../../lib/engine/detailing/slab-panel';
  import type { SlabBand, SlabPanelReinforcement } from '../../../../lib/design-contract/reinforcement';
  import { slabDeflectionBetween, slabPanelDeflection } from '../../../../lib/store/slab-deflection-store';

  const panels = $derived((detailingStore.lastFloorRun?.slabs ?? []).filter((s) => s.panel));
  let sel = $state<string | null>(null);
  $effect(() => { if (!sel && panels[0]) sel = panels[0].panelId; });
  const panel = $derived(panels.find((p) => p.panelId === sel) ?? null);
  let draft = $state<SlabPanelReinforcement | null>(null);
  let band = $state<string | null>(null);
  let note = $state<string | null>(null);
  $effect(() => { void sel; untrack(() => { draft = panel ? JSON.parse(JSON.stringify(panel.panel!.reinforcement)) : null; band = null; }); });
  const check = $derived(panel && draft ? checkPanel(panel.panel!.input, draft) : null);
  const inp = $derived(panel?.panel?.input);
  const b = $derived(draft?.bands.find((x) => x.id === band) ?? null);
  const KEYS = ['bottomX', 'bottomY', 'topX', 'topY'] as const;

  // Columns standing at the panel's corners and edges, for «over the columns».
  const columns = $derived.by(() => {
    if (!inp) return [];
    const out: Array<{ x: number; y: number }> = [];
    for (const e of modelStore.elements.values()) {
      const a = modelStore.nodes.get(e.nodeI), c = modelStore.nodes.get(e.nodeJ);
      if (!a || !c || Math.hypot(a.x - c.x, a.y - c.y) > 1e-6) continue;
      for (const p of [a, c]) if (p.x >= inp.x0 - 1e-6 && p.x <= inp.x1 + 1e-6 && p.y >= inp.y0 - 1e-6 && p.y <= inp.y1 + 1e-6 && !out.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-6)) out.push({ x: p.x, y: p.y });
    }
    return out;
  });

  function setBand(patch: Partial<SlabBand>) { if (draft && b) draft.bands = draft.bands.map((x) => (x.id === b.id ? { ...x, ...patch } : x)); }
  function addBand() {
    if (!draft || !inp) return;
    const id = `${panel!.panelId}-B${Date.now().toString(36)}`;
    draft.bands = [...draft.bands, { id, face: 'top', dir: 'x', x0: inp.x0, x1: inp.x0 + (inp.x1 - inp.x0) / 4, y0: inp.y0, y1: inp.y1, diameter: 10, spacing: 0.2 }];
    band = id;
  }
  let rx0 = $state(0), rx1 = $state(0), ry0 = $state(0), ry1 = $state(0);
  $effect(() => { if (inp) untrack(() => { rx0 = inp.x0; rx1 = inp.x1; ry0 = inp.y0; ry1 = inp.y1; }); });
  function equalizeRegion() { if (draft) draft = equalizeBands(draft, { x0: rx0, x1: rx1, y0: ry0, y1: ry1 }); }
  function equalizeColumns() {
    if (!draft || !inp) return;
    const w = Math.min(inp.x1 - inp.x0, inp.y1 - inp.y0) / 4;
    let r = draft;
    for (const c of columns) r = equalizeBands(r, { x0: c.x - w, x1: c.x + w, y0: c.y - w, y1: c.y + w });
    draft = r;
  }
  function save() {
    if (!panel || !draft) return;
    const d = storedDecisions();
    modelStore.reinforcementTransaction((api) => api.setDecisions({ ...d, slabs: { ...(d.slabs ?? {}), [panel.panelId]: JSON.parse(JSON.stringify(draft)) } }));
    detailingStore.generateFloors({ families: ['slab'] });
    note = t('slabEd.saved');
  }
  function revert() {
    if (!panel) return;
    const d = storedDecisions();
    const rest = { ...(d.slabs ?? {}) }; delete rest[panel.panelId];
    modelStore.reinforcementTransaction((api) => api.setDecisions({ ...d, slabs: rest }));
    detailingStore.generateFloors({ families: ['slab'] });
    note = t('slabEd.reverted');
  }

  // ── Deflections ──
  const defl = $derived(panel && draft ? slabPanelDeflection({ ...panel, panel: { ...panel.panel!, reinforcement: draft } }) : null);
  let ax = $state(0), ay = $state(0), bx = $state(0), by = $state(0);
  $effect(() => { if (inp) untrack(() => { ax = inp.x0; bx = inp.x1; ay = by = (inp.y0 + inp.y1) / 2; }); });
  let between = $state<ReturnType<typeof slabDeflectionBetween>>(null);
  const mm = (m: number) => (m * 1000).toFixed(2);

  // ── The plan ──
  const W = 520;
  const sc = $derived(inp ? Math.min((W - 30) / (inp.x1 - inp.x0), 340 / (inp.y1 - inp.y0)) : 1);
  const X = (x: number) => 15 + (x - (inp?.x0 ?? 0)) * sc;
  const Y = (y: number) => 15 + ((inp?.y1 ?? 0) - y) * sc;
</script>

<div class="se" data-testid="slab-editor">
  <aside class="se-list">
    {#if panels.length === 0}
      <p class="se-hint">{t('slabEd.none')}</p>
      <button class="se-btn" onclick={() => detailingStore.generateFloors({ families: ['slab'] })} data-testid="slab-design-run">{t('slabEd.designSlabs')}</button>
    {:else}
      <ul>{#each panels as p (p.panelId)}<li><button class:on={p.panelId === sel} onclick={() => (sel = p.panelId)} data-testid="slab-row-{p.panelId}">{p.panelId} · {p.panel!.input.x1 - p.panel!.input.x0 > 0 ? `${(p.panel!.input.x1 - p.panel!.input.x0).toFixed(2)}×${(p.panel!.input.y1 - p.panel!.input.y0).toFixed(2)}` : ''} · <span class:bad={p.panel!.check.worst > 1}>{p.panel!.check.worst.toFixed(2)}</span></button></li>{/each}</ul>
    {/if}
  </aside>
  {#if panel && draft && inp && check}
    <section class="se-main">
      {#if note}<p class="se-hint" role="status">{note}</p>{/if}
      <svg viewBox="0 0 {W} {(inp.y1 - inp.y0) * sc + 30}" class="se-svg" role="img" aria-label={t('slabEd.plan')} data-testid="slab-plan">
        <rect x={X(inp.x0)} y={Y(inp.y1)} width={(inp.x1 - inp.x0) * sc} height={(inp.y1 - inp.y0) * sc} class="se-panel" />
        {#each inp.elements as e (e.id)}<rect x={X(e.cx - e.sx / 2)} y={Y(e.cy + e.sy / 2)} width={e.sx * sc} height={e.sy * sc} class="se-el" />{/each}
        {#each draft.bands as x (x.id)}
          {@const bb = bandBars(x)}
          <polygon points={bandOutline(x).map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')} class="se-band {x.face}" class:on={x.id === band}
            role="button" tabindex="0" onclick={() => (band = x.id)} onkeydown={() => (band = x.id)} data-testid="slab-band-{x.id}" />
          <line x1={X(bb.bar[0].x)} y1={Y(bb.bar[0].y)} x2={X(bb.bar[1].x)} y2={Y(bb.bar[1].y)} class="se-bar" />
          <text x={X(x.label?.x ?? (x.x0 + x.x1) / 2)} y={Y(x.label?.y ?? (x.y0 + x.y1) / 2) + 3} class="se-t">{x.face === 'top' ? '↑' : '↓'}{x.angle !== undefined ? `${x.angle}°` : x.dir} {bb.count}Ø{x.diameter} c/{(x.spacing * 100).toFixed(0)}{x.group ? ' ▣' : ''}</text>
        {/each}
        {#each columns as c}<rect x={X(c.x) - 4} y={Y(c.y) - 4} width="8" height="8" class="se-col" />{/each}
      </svg>
      <p class="se-hint">{tp('slabEd.worst', { u: check.worst.toFixed(2) })} {check.minimumOk ? '' : t('slabEd.underMinimum')}</p>
      {#if defl}
        <p class="se-defl" class:bad={defl.utilization > 1} data-testid="slab-deflection">{tp('slabEd.deflection', { i: mm(defl.immediate), k: defl.crackFactor.toFixed(2), l: defl.lambda.toFixed(2), t: mm(defl.total), lim: mm(defl.limit), u: defl.utilization.toFixed(2) })} · {t(`slabEd.source.${defl.source}`)}</p>
      {/if}
      <div class="se-row" data-testid="slab-between">
        <span>{t('slabEd.between')}</span>
        <label>A<input type="number" step="0.1" bind:value={ax} /><input type="number" step="0.1" bind:value={ay} /></label>
        <label>B<input type="number" step="0.1" bind:value={bx} /><input type="number" step="0.1" bind:value={by} /></label>
        <button class="se-btn" onclick={() => (between = slabDeflectionBetween({ x: ax, y: ay }, { x: bx, y: by }))} data-testid="slab-between-go">{t('slabEd.measure')}</button>
        {#if between}<span data-testid="slab-between-result">{tp('slabEd.betweenResult', { d: mm(between.deflection), r: Number.isFinite(between.ratio) ? between.ratio.toFixed(0) : '∞' })}</span>{/if}
      </div>

      <div class="se-cols">
        <div>
          <h5>{t('slabEd.base')}</h5>
          <table class="se-base"><tbody>
            {#each KEYS as k}
              {@const v = draft.base[k]}
              <tr><td>{t(`slabEd.key.${k}`)}</td>
                <td><input type="checkbox" checked={!!v} onchange={(e) => { draft!.base = { ...draft!.base, [k]: e.currentTarget.checked ? { diameter: 8, spacing: 0.2 } : undefined }; }} /></td>
                {#if v}
                  <td>Ø<input type="number" min="6" max="25" value={v.diameter} onchange={(e) => { draft!.base = { ...draft!.base, [k]: { ...v, diameter: Number(e.currentTarget.value) } }; }} /></td>
                  <td>c/<input type="number" min="5" max="45" step="2.5" value={v.spacing * 100} onchange={(e) => { draft!.base = { ...draft!.base, [k]: { ...v, spacing: Number(e.currentTarget.value) / 100 } }; }} data-testid="slab-base-{k}" /></td>
                {/if}
              </tr>
            {/each}
          </tbody></table>
          <h5>{t('slabEd.bands')} ({draft.bands.length})</h5>
          {#if b}
            <div class="se-grid" data-testid="slab-band-panel">
              <label>{t('slabEd.face')}<select value={b.face} onchange={(e) => setBand({ face: e.currentTarget.value as 'top' })}><option value="top">{t('slabEd.top')}</option><option value="bottom">{t('slabEd.bottom')}</option></select></label>
              <label>{t('slabEd.dir')}<select value={b.dir} onchange={(e) => setBand({ dir: e.currentTarget.value as 'x' })}><option value="x">x</option><option value="y">y</option></select></label>
              <label>Ø<input type="number" min="6" max="25" value={b.diameter} onchange={(e) => setBand({ diameter: Number(e.currentTarget.value) })} /></label>
              <label>c/ (cm)<input type="number" min="5" max="45" step="2.5" value={b.spacing * 100} onchange={(e) => setBand({ spacing: Number(e.currentTarget.value) / 100 })} data-testid="slab-band-spacing" /></label>
              <label>x0<input type="number" step="0.05" value={b.x0.toFixed(2)} onchange={(e) => setBand({ x0: Number(e.currentTarget.value) })} /></label>
              <label>x1<input type="number" step="0.05" value={b.x1.toFixed(2)} onchange={(e) => setBand({ x1: Number(e.currentTarget.value) })} /></label>
              <label>y0<input type="number" step="0.05" value={b.y0.toFixed(2)} onchange={(e) => setBand({ y0: Number(e.currentTarget.value) })} /></label>
              <label>y1<input type="number" step="0.05" value={b.y1.toFixed(2)} onchange={(e) => setBand({ y1: Number(e.currentTarget.value) })} /></label>
              <label class="se-chk"><input type="checkbox" checked={!!b.hookStart} onchange={(e) => setBand({ hookStart: e.currentTarget.checked || undefined })} /> {t('slabEd.hookStart')}</label>
              <label class="se-chk"><input type="checkbox" checked={!!b.hookEnd} onchange={(e) => setBand({ hookEnd: e.currentTarget.checked || undefined })} /> {t('slabEd.hookEnd')}</label>
            </div>
            <SlabBandTools draft={draft} band={b} input={inp} apply={(next) => (draft = next)} />
            <button class="se-btn se-danger" onclick={() => { draft!.bands = draft!.bands.filter((x) => x.id !== b!.id); band = null; }}>{t('slabEd.delete')}</button>
          {/if}
          <div class="se-row"><button class="se-btn" onclick={addBand} data-testid="slab-add-band">{t('slabEd.addBand')}</button></div>
          <h5>{t('slabEd.equalize')}</h5>
          <div class="se-row">
            <label>x<input type="number" step="0.1" bind:value={rx0} />–<input type="number" step="0.1" bind:value={rx1} /></label>
            <label>y<input type="number" step="0.1" bind:value={ry0} />–<input type="number" step="0.1" bind:value={ry1} /></label>
            <button class="se-btn" onclick={equalizeRegion} data-testid="slab-equalize-region">{t('slabEd.equalizeRegion')}</button>
            <button class="se-btn" onclick={equalizeColumns} disabled={columns.length === 0}>{t('slabEd.equalizeColumns')}</button>
          </div>
          <div class="se-row">
            <button class="se-btn se-primary" onclick={save} data-testid="slab-save">{t('slabEd.save')}</button>
            {#if panel.panel!.saved}<button class="se-btn" onclick={revert}>{t('slabEd.revert')}</button>{/if}
          </div>
        </div>
        <table class="se-checks" data-testid="slab-checks"><thead><tr><th>{t('slabEd.strip')}</th><th>cm²/m</th><th>u</th></tr></thead><tbody>
          {#each check.strips as c}
            <tr class:bad={c.utilization > 1 + 1e-9}><td>{c.dir} {c.face === 'top' ? '↑' : '↓'} {t(`slabEd.kind.${c.kind}`)} {c.lo.toFixed(1)}–{c.hi.toFixed(1)}</td><td class="num">{(c.need * 1e4).toFixed(2)} / {(c.given * 1e4).toFixed(2)}</td><td class="num">{Number.isFinite(c.utilization) ? c.utilization.toFixed(2) : '∞'}</td></tr>
          {/each}
        </tbody></table>
      </div>
    </section>
  {/if}
  <FamilyBatch family="slab" />
</div>

<style>
  .se { display: grid; grid-template-columns: 14rem minmax(0, 1fr); gap: 8px; padding: 8px; font-size: 0.72rem; }
  .se-list ul { list-style: none; margin: 0; padding: 0; max-height: 70vh; overflow: auto; }
  .se-list li button { width: 100%; text-align: left; font-size: 0.68rem; padding: 2px 4px; border: none; background: none; color: var(--st-text-2); cursor: pointer; }
  .se-list li button.on { background: var(--st-surface-3); color: var(--st-text); }
  .se-svg { width: 100%; max-width: 560px; background: var(--st-surface); border: 1px solid var(--st-hair); border-radius: 4px; }
  .se-panel { fill: var(--st-surface-2); stroke: var(--st-text-3); }
  .se-el { fill: none; stroke: var(--st-hair); stroke-width: 0.5; }
  .se-band { fill-opacity: 0.25; stroke-width: 1; cursor: pointer; }
  .se-band.top { fill: var(--st-warn); stroke: var(--st-warn); } .se-band.bottom { fill: var(--st-value); stroke: var(--st-value); }
  .se-band.on { stroke: var(--st-accent); stroke-width: 2.4; }
  .se-t { font-size: 8px; fill: var(--st-text); text-anchor: middle; pointer-events: none; }
  .se-col { fill: var(--st-text-2); }
  .se-cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 18rem); gap: 10px; }
  .se-cols h5 { margin: 6px 0 4px; font-size: 0.74rem; }
  .se-base input, .se-grid input, .se-row input { width: 3.6rem; font-size: 0.7rem; }
  .se-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr)); gap: 3px 8px; }
  .se-grid label, .se-row label { display: flex; align-items: center; gap: 4px; color: var(--st-text-2); }
  .se-row { display: flex; gap: 6px; align-items: center; margin-top: 6px; flex-wrap: wrap; }
  .se-btn { font-size: 0.68rem; padding: 2px 8px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); border-radius: 4px; cursor: pointer; }
  .se-primary { background: var(--st-accent); border-color: var(--st-accent); color: var(--st-on-accent, #fff); }
  .se-danger { border-color: var(--st-danger); color: var(--st-danger); margin-top: 4px; }
  .se-checks { border-collapse: collapse; width: 100%; }
  .se-checks th { text-align: left; font-weight: 500; color: var(--st-text-3); }
  .se-checks td { padding: 2px 6px; border-top: 1px solid var(--st-hair); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .bad, tr.bad td { color: var(--st-danger); }
  .se-hint { color: var(--st-text-3); }
  .se-defl { margin: 2px 0; }
  @media (max-width: 1000px) { .se, .se-cols { grid-template-columns: 1fr; } }
  .se-bar { stroke: var(--st-value); stroke-width: 1.4; pointer-events: none; }
</style>
