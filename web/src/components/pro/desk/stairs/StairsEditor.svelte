<!--
  Stairs: the project's straight concrete stairs, each stated by its flight, its landings, how its
  ends bear and its loads, designed as a one-way slab with its bars, and its reactions put on the
  beams it lands on. The live load is taken from Tabla 4.1 of CIRSOC 101 or typed.
-->
<script lang="ts">
  import { t, tp } from '../../../../lib/i18n';
  import FamilyBatch from '../FamilyBatch.svelte';
  import { modelStore } from '../../../../lib/store';
  import { applyStairReactions, removeStair, saveStair, stairChecks, type StairEntry } from '../../../../lib/store/stairs-pt';
  import { findOccupancy } from '../../../../lib/codes/cirsoc101/live-loads';
  import SteelMemberSheet from '../steel/SteelMemberSheet.svelte';
  import StairFlightFields from '../../stairs/StairFlightFields.svelte';
  import { stairPlates } from '../../../../lib/store/stair-link';
  import { uiStore } from '../../../../lib/store';
  import StairFlightBuilder from './StairFlightBuilder.svelte';

  /*
   * The flight in metres, through the same fields the model's stair uses; the rest of the form
   * keeps its own units (cm for the landings' thickness, m for the plan, kN/m² for the loads).
   */
  let flight = $state({ riser: 0.175, tread: 0.28, steps: 16, waist: 0.15 });

  const checks = $derived(stairChecks());
  let selected = $state<string | null>(null);
  const current = $derived(checks.find((c) => c.entry.id === selected) ?? null);
  let note = $state('');

  const num = (s: string | undefined) => { const v = Number(String(s ?? '').replace(',', '.')); return String(s ?? '').trim() !== '' && Number.isFinite(v) && v >= 0 ? v : undefined; };
  const stateKey = (s: string) => (s === 'ok' ? 'mat.state.ok' : s === 'nearLimit' ? 'mat.state.near' : s === 'fail' ? 'mat.state.fail' : 'mat.state.none');
  const LIVE = ['escalera_otros', 'escalera_privada'] as const;
  const liveOf = (k: string) => findOccupancy(k)?.uniformKNm2 ?? undefined;

  // The form: cm for the step and the slabs, m for the plan, kN/m² for the loads.
  const blank = (): Record<string, string> => ({ name: '', width: '1.2', landingBottom: '1', landingTop: '1', landingThickness: '', ends: 'monolithic', finishes: '', liveFrom: 'escalera_otros', live: String(liveOf('escalera_otros') ?? '') });
  let form = $state<Record<string, string>>(blank());

  function pick(id: string) {
    selected = id;
    const e = checks.find((c) => c.entry.id === id)?.entry;
    if (!e) return;
    flight = { riser: e.riser, tread: e.tread, steps: e.steps, waist: e.waist };
    form = { name: e.name, width: String(e.width), landingBottom: String(e.landingBottom), landingTop: String(e.landingTop),
      landingThickness: e.landingThickness ? String(e.landingThickness * 100) : '', ends: e.ends, finishes: String(e.finishes), liveFrom: 'typed', live: String(e.live) };
    sup = { foot: e.supports?.foot ? String(e.supports.foot.elementId) : '', footA: String(e.supports?.foot?.a ?? 0), head: e.supports?.head ? String(e.supports.head.elementId) : '', headA: String(e.supports?.head?.a ?? 0) };
  }
  function fresh() { selected = null; form = blank(); flight = { riser: 0.175, tread: 0.28, steps: 16, waist: 0.15 }; note = ''; }
  function onLiveFrom() { if (form.liveFrom !== 'typed') form.live = String(liveOf(form.liveFrom) ?? ''); }

  const flightOk = $derived(flight.riser > 0 && flight.tread > 0 && flight.steps >= 2 && flight.waist > 0);
  const missingFields = $derived([...(flightOk ? [] : ['flight']), ...['name', 'width', 'finishes', 'live'].filter((k) => (k === 'name' ? !form.name.trim() : num(form[k]) === undefined))]);
  function save() {
    if (missingFields.length) { note = t('stair.ui.missing'); return; }
    const cm = (k: string) => num(form[k])! / 100;
    const id = selected ?? `st-${Date.now().toString(36)}`;
    const prev = checks.find((c) => c.entry.id === id)?.entry;
    const e: StairEntry = {
      id, name: form.name.trim(), riser: flight.riser, tread: flight.tread, steps: Math.round(flight.steps), waist: flight.waist, width: num(form.width)!,
      landingBottom: num(form.landingBottom) ?? 0, landingTop: num(form.landingTop) ?? 0, ...(num(form.landingThickness) ? { landingThickness: cm('landingThickness') } : {}),
      ends: form.ends === 'simple' ? 'simple' : 'monolithic', finishes: num(form.finishes)!, live: num(form.live)!, ...(prev?.supports ? { supports: prev.supports } : {}),
      ...(prev?.analysisQuads ? { analysisQuads: prev.analysisQuads } : {}),
    };
    saveStair(e);
    selected = id;
    note = '';
  }

  // Beams the reactions go on: the model's horizontal frames.
  const beams = $derived([...modelStore.elements.values()].filter((e) => {
    const a = modelStore.nodes.get(e.nodeI), b = modelStore.nodes.get(e.nodeJ);
    return a && b && Math.abs((a.z ?? 0) - (b.z ?? 0)) < 0.05 && Math.hypot(b.x - a.x, (b.y ?? 0) - (a.y ?? 0)) > 0.05;
  }).map((e) => e.id).sort((p, q) => p - q));
  let sup = $state<Record<string, string>>({ foot: '', footA: '0', head: '', headA: '0' });
  function apply() {
    if (!current) return;
    const s = (k: 'foot' | 'head') => (sup[k] ? { elementId: Number(sup[k]), a: num(sup[`${k}A`]) ?? 0 } : undefined);
    const foot = s('foot'), head = s('head');
    const n = applyStairReactions(current.entry.id, { ...(foot ? { foot } : {}), ...(head ? { head } : {}) });
    note = tp('stair.ui.applied', { n });
  }
</script>

<div class="sf" data-testid="stairs-editor">
  <p class="muted">{t('stair.ui.lead')}</p>

  <table class="sf-t">
    <tbody>
      {#each checks as c (c.entry.id)}
        <tr class:on={selected === c.entry.id} onclick={() => pick(c.entry.id)} data-testid="stair-row-{c.entry.id}">
          <td>{c.entry.name}</td><td>{tp('stair.ui.flight', { n: c.entry.steps, r: (c.entry.riser * 100).toFixed(1), t: (c.entry.tread * 100).toFixed(1) })}</td>
          <td>{c.design.geometry.span.toFixed(2)} m</td>{#if uiStore.designInPro}<td>{t(stateKey(c.status))}</td>{/if}
        </tr>
      {/each}
    </tbody>
  </table>
  {#if checks.length === 0}<p class="muted">{t('stair.ui.none')}</p>{/if}

  <!-- The flight typed below, built in the model as its waist slab and designed as this stair. -->
  <StairFlightBuilder {flight} width={num(form.width)} onDesigned={pick} />

  <details class="sf-sec" open>
    <summary>{selected ? t('stair.ui.edit') : t('stair.ui.new')}{#if selected}<button class="link" onclick={fresh}>{t('stair.ui.newOne')}</button>{/if}</summary>
    <div class="sf-form">
      <label>{t('stair.ui.name')} <input bind:value={form.name} data-testid="stair-name" /></label>
      <div class="sf-flight"><StairFlightFields bind:riser={flight.riser} bind:tread={flight.tread} bind:steps={flight.steps} bind:waist={flight.waist} testid="desk-stair" /></div>
      {#each [['width', 'stair.ui.width'], ['landingBottom', 'stair.ui.landingBottom'], ['landingTop', 'stair.ui.landingTop'], ['landingThickness', 'stair.ui.landingThickness']] as [k, label] (k)}
        <label>{t(label)} <input inputmode="decimal" bind:value={form[k]} data-testid="stair-{k}" /></label>
      {/each}
      <label>{t('stair.ui.ends')} <select bind:value={form.ends} data-testid="stair-ends"><option value="monolithic">{t('stair.ui.monolithic')}</option><option value="simple">{t('stair.ui.simple')}</option></select></label>
      <label>{t('stair.ui.finishes')} <input inputmode="decimal" bind:value={form.finishes} data-testid="stair-finishes" /></label>
      <label>{t('stair.ui.liveFrom')}
        <select bind:value={form.liveFrom} onchange={onLiveFrom} data-testid="stair-live-from">
          {#each LIVE as k (k)}<option value={k}>{t(`loads.occupancy.${k}`)} ({liveOf(k)})</option>{/each}
          <option value="typed">{t('stair.ui.typed')}</option>
        </select>
      </label>
      <label>{t('stair.ui.live')} <input inputmode="decimal" bind:value={form.live} readonly={form.liveFrom !== 'typed'} data-testid="stair-live" /></label>
      <button onclick={save} data-testid="stair-save">{t('mat.save')}</button>
    </div>
    {#if note}<p class="muted" data-testid="stair-note">{note}</p>{/if}
  </details>

  {#if current}
    {@const d = current.design}
    {@const plates = stairPlates(current.entry)}
    <p class="muted" data-testid="stair-analysis">{plates.length
      ? tp('stair.ui.modelled', { n: plates.length })
      : t('stair.ui.notModelled')}
      {#if plates.length}<button class="link" onclick={() => { uiStore.setSelection(new Set(), new Set(), false, new Set(plates.map((q) => `q${q}`))); }} data-testid="stair-select-plates">{t('stair.ui.selectPlates')}</button>{/if}</p>
    <!-- Its design (moments, the member sheet and the bars) with design on; its geometry, its plates
         and the reactions it puts on the beams either way. -->
    {#if uiStore.designInPro}
    <p class="muted" data-testid="stair-summary">{tp('stair.ui.summary', { ang: d.geometry.angleDeg.toFixed(1), L: d.geometry.span.toFixed(2), wf: d.loads.wuFlight.toFixed(2), wl: d.loads.wuLanding.toFixed(2), mu: d.mu.toFixed(1), mn: d.muNeg.toFixed(1) })}</p>
    <SteelMemberSheet rows={current.rows} note={t(current.entry.ends === 'simple' ? 'stair.note.simple' : 'stair.note.monolithic')} />
    <table class="sf-t" data-testid="stair-bars">
      <thead><tr><th>{t('plan.bbs.mark')}</th><th>Ø</th><th>{t('plan.bbs.count')}</th><th>{t('stair.ui.spacing')}</th><th>{t('plan.bbs.cut')}</th></tr></thead>
      <tbody>
        {#each d.bars as b (b.mark)}<tr><td>{b.mark} · {t(`stair.bar.${b.role}`)}</td><td>{b.diameterMm}</td><td>{b.count}</td><td>{Math.round(b.spacing * 1000)} mm</td><td>{b.length.toFixed(2)}</td></tr>{/each}
      </tbody>
    </table>
    {/if}
    <details class="sf-sec" data-testid="stair-reactions">
      <summary>{t('stair.ui.reactions')} <span class="muted">· {tp('stair.ui.reactionsSummary', { fd: d.reactions.foot.dead.toFixed(2), fl: d.reactions.foot.live.toFixed(2), hd: d.reactions.head.dead.toFixed(2), hl: d.reactions.head.live.toFixed(2) })}</span></summary>
      <div class="sf-form">
        <label>{t('stair.ui.footBeam')} <select bind:value={sup.foot} data-testid="stair-foot-beam"><option value="">—</option>{#each beams as id (id)}<option value={String(id)}>{id}</option>{/each}</select></label>
        <label>{t('stair.ui.from')} <input inputmode="decimal" bind:value={sup.footA} /></label>
        <label>{t('stair.ui.headBeam')} <select bind:value={sup.head} data-testid="stair-head-beam"><option value="">—</option>{#each beams as id (id)}<option value={String(id)}>{id}</option>{/each}</select></label>
        <label>{t('stair.ui.from')} <input inputmode="decimal" bind:value={sup.headA} /></label>
        <button onclick={apply} data-testid="stair-apply">{t('stair.ui.apply')}</button>
      </div>
    </details>
    <button class="link" onclick={() => { removeStair(current.entry.id); fresh(); }} data-testid="stair-remove">{t('mat.timber.drop')}</button>
  {/if}
  {#if uiStore.designInPro}<FamilyBatch family="stair" />{/if}
</div>

<style>
  .sf { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem; font-size: 0.72rem; overflow: auto; }
  .muted { margin: 0; color: var(--st-text-2); font-size: 0.68rem; line-height: 1.35; }
  .sf-sec { border: 1px solid var(--st-hair); border-radius: 4px; padding: 0.4rem 0.5rem; display: flex; flex-direction: column; gap: 0.35rem; }
  .sf-sec summary { cursor: pointer; font-weight: 600; }
  .sf-t { width: 100%; border-collapse: collapse; }
  .sf-t td, .sf-t th { padding: 2px 4px; border-top: 1px solid var(--st-hair); text-align: left; }
  .sf-t tbody tr { cursor: pointer; }
  .sf-t tr.on td { background: var(--st-surface-3); }
  .sf-flight { flex-basis: 100%; }
  .sf-form { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: end; margin: 0.3rem 0; }
  .sf-form label { display: flex; flex-direction: column; gap: 0.1rem; color: var(--st-text-2); font-size: 0.66rem; }
  input, select { font-size: 0.72rem; width: 5.5rem; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 3px; padding: 0.1rem 0.3rem; }
  select { width: auto; max-width: 16rem; }
  button { font-size: 0.7rem; padding: 0.15rem 0.45rem; background: var(--st-surface-3); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 4px; cursor: pointer; }
  button.link { background: none; border: none; color: var(--st-value); padding: 0 0.3rem; align-self: flex-start; }
</style>
