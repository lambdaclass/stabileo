<script lang="ts">
  /**
   * The frame editor: the beam line the selected member is on, its bars and stirrups as a draft
   * along the line. Each edit is checked at once (the members' regions projected from the draft,
   * by the bound code); a point on the line shows its moments against what the bars give there;
   * «Save» writes the members and keeps the line, one undo step; lines grouped with it follow.
   *
   * The draft is kept in `designDrafts`, not here: closing design, moving to another stage or
   * another project tab, or opening another member unmounts this editor, and the draft waits for
   * it to open the same line again. Only «Save» writes it and only «Save» or «Discard» drops it.
   */
  import { untrack } from 'svelte';
  import { t, tp } from '../../../../lib/i18n';
  import { modelStore } from '../../../../lib/store';
  import { verificationStore } from '../../../../lib/store/verification.svelte';
  import { checkDraft, frameGroupOf, lineMembers, openLine, saveLine, setFrameGroup } from '../../../../lib/store/beam-line-store';
  import { framesOf } from '../../../../lib/store/frame-equalize';
  import { lineKey, type BeamLineReinforcement } from '../../../../lib/design-contract/beam-line';
  import type { BeamLine } from '../../../../lib/engine/design/repeated-frames';
  import { addCut, areaAt, memberOffsets, removeCut } from '../../../../lib/engine/design/beam-line';
  import { lineCombos, lineDemand, lineTransverseDemand, shiftedDemand } from '../../../../lib/engine/design/beam-line-demand';
  import { computeFlexureCapacity, requiredLd } from '../../../../lib/engine/station-design-forces';
  import FrameElevation from './FrameElevation.svelte';
  import FramePanel from './FramePanel.svelte';
  import StaleLinesNotice from './StaleLinesNotice.svelte';
  import FrameOpenings from './FrameOpenings.svelte';
  import { checkLabel } from '../../../../lib/engine/design/check-clauses';
  import FrameHangers from './FrameHangers.svelte';
  import { lineHangers } from '../../../../lib/store/line-hangers';
  import { lineOpenings, memberAtLine } from '../../../../lib/store/line-openings';
  import { openingChecks } from '../../../../lib/store/special-elements';
  import type { StaleLine } from '../../../../lib/store/beam-line-store';
  import { designDrafts } from '../../../../lib/store/design-drafts.svelte';

  let { memberId }: { memberId: number } = $props();

  let line = $state<BeamLine | null>(null);
  let draft = $state<BeamLineReinforcement | null>(null);
  let saved = $state(false);
  let dirty = $state(false);
  let undo = $state<BeamLineReinforcement[]>([]);
  let selBar = $state<string | null>(null), selBar2 = $state<string | null>(null), selZone = $state<string | null>(null);
  let pointX = $state<number | null>(null);
  let note = $state<string | null>(null);
  /** A saved line the members no longer match: not applied, offered (`StaleLinesNotice`). */
  let stale = $state<StaleLine | null>(null);

  /** Open the member's line: its kept draft when there is one, else what the members hold. */
  function load() {
    const o = openLine(memberId);
    line = o?.line ?? null; draft = o?.model ?? null; saved = o?.saved ?? false; stale = o?.stale ?? null;
    dirty = false; undo = []; selBar = selBar2 = selZone = null; pointX = null; note = null;
    const kept = line ? designDrafts.frame(lineKey(line.members)) : undefined;
    if (kept) { draft = kept.draft; undo = kept.undo; dirty = true; note = t('frameEd.draftRestored'); }
  }
  /** Keep the draft where it outlives this editor. */
  function keep() {
    if (!line || !draft || !dirty) return;
    designDrafts.setFrame({ key: lineKey(line.members), members: [...line.members], label: line.label, draft, undo });
  }
  /** «Discard»: the draft goes, and the line is read from the members again. */
  function discard() {
    if (line) designDrafts.dropFrame(lineKey(line.members));
    load();
  }
  $effect(() => { void memberId; untrack(load); });

  const members = $derived(line ? lineMembers(line) : []);
  const faces = $derived(members.map((m) => ({ start: m.faceStart, end: m.faceEnd })));
  const verdicts = $derived(line && draft ? checkDraft(line, draft) : new Map());
  const failing = $derived(new Set([...verdicts].filter(([, v]) => v.checks.some((c: { status: string }) => c.status === 'fail')).map(([id]) => id as number)));
  const worst = $derived(Math.max(0, ...[...verdicts.values()].map((v) => v.worstUtilization ?? 0)));
  // What the diagrams show: the envelope or one combination, the law shifted by d or not, on the
  // beam or below it, and which part of the stirrups' demand.
  let comboId = $state<number | undefined>(undefined);
  let showShift = $state(false), lawOn = $state<'beam' | 'below'>('below');
  let tMode = $state<'shear' | 'torsion' | 'both'>('both'), tMin = $state(true);
  /** While on, a click on the elevation places a cross-section there instead of reading the point. */
  let placing = $state(false);
  function onPoint(x: number) {
    if (placing && draft) { apply(addCut(draft, x)); placing = false; return; }
    pointX = x;
  }
  const spans = $derived.by(() => {
    if (!line || !draft) return [];
    const offs = memberOffsets(draft);
    return line.members.map((id, i) => ({ ctx: verificationStore.contextFor(id), offset: offs[i]!, L: draft!.lengths[i]!, forward: line!.forward[i] !== false }));
  });
  const combos = $derived(lineCombos(spans.map((s) => s.ctx)));
  const demand = $derived(lineDemand(spans, comboId));
  const shifted = $derived(showShift ? shiftedDemand(demand) : null);
  const transverse = $derived(lineTransverseDemand(spans, comboId));
  const spanOf = (id: number) => verificationStore.contextFor(id)?.span;
  const hangers = $derived(line && draft ? lineHangers(line, draft.lengths) : []);
  const holes = $derived.by(() => {
    void modelStore.designDecisions;
    return line && draft ? lineOpenings(openingChecks(), draft, line.forward, (id) => verificationStore.contextFor(id)?.axes.hFlex, spanOf) : [];
  });
  const repeats = $derived.by(() => { void modelStore.designDecisions; return line ? (framesOf(line.members[0]!)?.group?.lines ?? []) : []; });
  const key = $derived(line ? lineKey(line.members) : '');
  const grouped = $derived.by(() => { void modelStore.designDecisions; return key ? frameGroupOf(key) : null; });

  function apply(next: BeamLineReinforcement) {
    if (!draft) return;
    undo = [...undo, draft].slice(-50);
    draft = next; dirty = true; note = null;
    keep();
  }
  /** Take a redesigned line's saved bars up again as a draft: checked here, written only by «Save». */
  function takeUp(s: StaleLine) {
    const { memberHashes: _old, ...rec } = JSON.parse(JSON.stringify(s.record)) as BeamLineReinforcement;
    apply(rec as BeamLineReinforcement);
    stale = null; note = t('frameEd.stale.takenUp');
  }
  function back() { const prev = undo[undo.length - 1]; if (prev) { draft = prev; undo = undo.slice(0, -1); dirty = true; keep(); } }
  function save() {
    if (!line || !draft) return;
    const n = saveLine(line, draft);
    designDrafts.dropFrame(lineKey(line.members));
    note = tp('frameEd.saved', { n: n.length }); dirty = false; saved = true; undo = [];
  }
  function onBar(id: string, additive: boolean) {
    selZone = null;
    if (additive && selBar && selBar !== id) selBar2 = id; else { selBar = id; selBar2 = null; }
  }

  // ── The point check ──
  const point = $derived.by(() => {
    if (pointX === null || !draft || !line) return null;
    const x = pointX;
    const near = demand.reduce<{ d: number; p: (typeof demand)[number] | null }>((b, p) => (Math.abs(p.x - x) < b.d ? { d: Math.abs(p.x - x), p } : b), { d: Infinity, p: null }).p;
    const offs = memberOffsets(draft);
    const k = Math.max(0, offs.findIndex((o, i) => x >= o - 1e-9 && x <= o + draft!.lengths[i]! + 1e-9));
    const ctx = verificationStore.contextFor(line.members[k]!);
    if (!ctx) return null;
    const d = ctx.axes.hFlex - ctx.material.cover - ctx.material.stirrupDia / 1000 - 0.01;
    const bottom = areaAt(draft, 'bottom', x), top = areaAt(draft, 'top', x);
    const cap = (As: number) => (As > 0 ? computeFlexureCapacity(As, ctx.axes.bFlex, d, ctx.material.fc, ctx.material.fy)?.phiMn ?? 0 : 0);
    return { x, mPos: near?.mPos ?? 0, mNeg: near?.mNeg ?? 0, bottom, top, capPos: cap(bottom), capNeg: cap(top) };
  });

  /** The station where the bars are used hardest: the largest Mu/φMn of either face. */
  function worstPoint() {
    if (!draft || !line) return;
    const offs = memberOffsets(draft);
    let best: { x: number; u: number } | null = null;
    for (const p of demand) {
      const k = Math.max(0, offs.findIndex((o, i) => p.x >= o - 1e-9 && p.x <= o + draft!.lengths[i]! + 1e-9));
      const ctx = verificationStore.contextFor(line.members[k]!);
      if (!ctx) continue;
      const d = ctx.axes.hFlex - ctx.material.cover - ctx.material.stirrupDia / 1000 - 0.01;
      const cap = (As: number) => (As > 0 ? computeFlexureCapacity(As, ctx.axes.bFlex, d, ctx.material.fc, ctx.material.fy)?.phiMn ?? 0 : 0);
      const u = Math.max(p.mPos > 1e-6 ? p.mPos / Math.max(cap(areaAt(draft, 'bottom', p.x)), 1e-9) : 0, p.mNeg > 1e-6 ? p.mNeg / Math.max(cap(areaAt(draft, 'top', p.x)), 1e-9) : 0);
      if (!best || u > best.u) best = { x: p.x, u };
    }
    if (best) pointX = best.x;
  }

  const lapOf = (dia: number) => {
    const ctx = line ? verificationStore.contextFor(line.members[0]!) : undefined;
    return ctx ? 1.3 * requiredLd(dia, ctx.material.fc, ctx.material.fy) : 0.05 * dia;
  };
</script>

{#if !line || !draft}
  <p class="fx-hint" data-testid="frame-editor-empty">{t('frameEd.noLine')}</p>
{:else}
  <div class="fx" data-testid="frame-editor">
    <header class="fx-head">
      <h4>{tp('frameEd.title', { label: line.label, n: line.members.length })}</h4>
      <span class="fx-badge" data-testid="frame-state">{saved && !dirty ? t('frameEd.stateSaved') : dirty ? t('frameEd.stateDraft') : t('frameEd.stateRead')}</span>
      <span class="fx-badge" class:bad={failing.size > 0} data-testid="frame-verdict">{failing.size > 0 ? tp('frameEd.failing', { n: failing.size }) : tp('frameEd.verifies', { u: worst.toFixed(2) })}</span>
      <button disabled={undo.length === 0} onclick={back} data-testid="frame-undo">{t('frameEd.undo')}</button>
      <button disabled={!dirty} onclick={discard} data-testid="frame-discard">{t('frameEd.discard')}</button>
      <button class="fx-primary" disabled={!dirty} onclick={save} data-testid="frame-save">{t('frameEd.save')}</button>
      {#if repeats.length > 1}
        {#if grouped}
          <button onclick={() => setFrameGroup([key])} data-testid="frame-ungroup">{t('frameEd.ungroup')}</button>
        {:else}
          <button onclick={() => setFrameGroup(repeats.map((l) => lineKey(l.members)))} title={t('frameEd.groupHint')} data-testid="frame-group">{tp('frameEd.group', { n: repeats.length })}</button>
        {/if}
      {/if}
    </header>
    {#if stale}<StaleLinesNotice one={stale} onTakeUp={takeUp} />{/if}
    {#if note}<p class="fx-hint" role="status">{note}</p>{/if}
    <div class="fx-view" data-testid="frame-view">
      <label>{t('frameEd.view.combo')}
        <select value={comboId ?? ''} onchange={(e) => (comboId = e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value))} data-testid="frame-view-combo">
          <option value="">{t('frameEd.view.envelope')}</option>
          {#each combos as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
        </select>
      </label>
      <label><input type="checkbox" bind:checked={showShift} data-testid="frame-view-shift" /> {t('frameEd.view.shift')}</label>
      <label>{t('frameEd.view.lawOn')}
        <select bind:value={lawOn} data-testid="frame-view-law"><option value="below">{t('frameEd.view.below')}</option><option value="beam">{t('frameEd.view.onBeam')}</option></select>
      </label>
      <label>{t('frameEd.view.stirrups')}
        <select bind:value={tMode} data-testid="frame-view-transverse"><option value="both">{t('frameEd.view.both')}</option><option value="shear">{t('frameEd.view.shear')}</option><option value="torsion">{t('frameEd.view.torsion')}</option></select>
      </label>
      <label><input type="checkbox" bind:checked={tMin} data-testid="frame-view-min" /> {t('frameEd.view.min')}</label>
    </div>
    <FrameElevation line={draft} {faces} {demand} {shifted} {lawOn} {transverse} {tMode} {tMin} {holes} selectedBar={selBar} secondBar={selBar2} selectedZone={selZone} {pointX} {failing}
      onBar={onBar} onZone={(id) => { selZone = id; selBar = selBar2 = null; }} {onPoint} />
    <div class="fx-view" data-testid="frame-cuts">
      <button class:on={placing} onclick={() => (placing = !placing)} data-testid="frame-cut-place">{placing ? t('frameEd.cuts.clickHint') : t('frameEd.cuts.place')}</button>
      {#each draft.cuts ?? [] as c (c.id)}
        <span class="fx-cut">{c.label}–{c.label} · {c.x.toFixed(2)} m <button aria-label={tp('frameEd.cuts.remove', { label: c.label })} onclick={() => apply(removeCut(draft!, c.id))} data-testid="frame-cut-remove-{c.label}">×</button></span>
      {/each}
      {#if (draft.cuts ?? []).length}<span class="fx-hint">{t('frameEd.cuts.onSheet')}</span>{/if}
    </div>
    <p class="fx-legend"><span class="need">- -</span> {t('frameEd.needed')} · <span class="give">—</span> {t('frameEd.provided')}{#if showShift} · <span class="shift">- -</span> {t('frameEd.view.shiftLegend')}{/if}</p>
    {#if point}
      <table class="fx-point" data-testid="frame-point">
        <thead><tr><th>x = {point.x.toFixed(2)} m</th><th>Mu</th><th>As</th><th>φMn</th><th></th></tr></thead>
        <tbody>
          <tr><td>{t('frameEd.bottom')}</td><td>{point.mPos.toFixed(1)}</td><td>{point.bottom.toFixed(2)} cm²</td><td>{point.capPos.toFixed(1)}</td><td class:bad={point.mPos > point.capPos + 1e-6}>{point.mPos > 1e-6 ? (point.mPos / Math.max(point.capPos, 1e-9)).toFixed(2) : '—'}</td></tr>
          <tr><td>{t('frameEd.top')}</td><td>{point.mNeg.toFixed(1)}</td><td>{point.top.toFixed(2)} cm²</td><td>{point.capNeg.toFixed(1)}</td><td class:bad={point.mNeg > point.capNeg + 1e-6}>{point.mNeg > 1e-6 ? (point.mNeg / Math.max(point.capNeg, 1e-9)).toFixed(2) : '—'}</td></tr>
        </tbody>
      </table>
    {:else}
      <p class="fx-hint">{t('frameEd.pointHint')}</p>
    {/if}
    <div><button class="fx-worst" onclick={worstPoint} data-testid="frame-worst">{t('frameEd.worst')}</button></div>
    <div class="fx-cols">
      <FramePanel line={draft} selectedBar={selBar} secondBar={selBar2} selectedZone={selZone} {lapOf} {apply} clearSelection={() => { selBar = selBar2 = selZone = null; }} />
      <section class="fx-members" data-testid="frame-members">
        <FrameOpenings openings={holes} locate={(x) => (line && draft ? memberAtLine(draft, line.forward, x, spanOf) : null)} total={draft.lengths.reduce((a, l) => a + l, 0)} />
        <FrameHangers supports={hangers} line={draft} {apply} />
        <h5>{t('frameEd.members')}</h5>
        {#each line.members as id, i (id)}
          {@const v = verdicts.get(id)}
          <div class="fx-m" class:bad={failing.has(id)}>
            <span>{i + 1} · #{id}</span>
            <span>{v ? v.worstUtilization.toFixed(2) : '—'}</span>
            {#if v}{#each v.checks.filter((c: { status: string }) => c.status === 'fail').slice(0, 3) as c}<span class="fx-c">{checkLabel(c, 'beam')}</span>{/each}{/if}
          </div>
        {/each}
      </section>
    </div>
  </div>
{/if}

<style>
  .fx { display: flex; flex-direction: column; gap: 6px; padding: 8px; }
  .fx-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .fx-head h4 { margin: 0; font-size: 0.82rem; }
  .fx-head button { font-size: 0.7rem; padding: 2px 9px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); border-radius: 4px; cursor: pointer; }
  .fx-head button:disabled { opacity: 0.45; cursor: default; }
  .fx-head .fx-primary { background: var(--st-accent); border-color: var(--st-accent); color: var(--st-on-accent, #fff); }
  .fx-worst { font-size: 0.68rem; padding: 2px 8px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); border-radius: 4px; cursor: pointer; }
  .fx-badge { font-size: 0.66rem; padding: 1px 7px; border-radius: 9px; background: var(--st-surface-3); color: var(--st-text-2); }
  .fx-badge.bad, .bad { color: var(--st-danger); }
  .fx-hint { font-size: 0.7rem; color: var(--st-text-3); margin: 0; }
  .fx-legend { font-size: 0.66rem; color: var(--st-text-3); margin: 0; }
  .need { color: var(--st-danger); } .give { color: var(--st-ok); } .shift { color: var(--st-warn); }
  .fx-view { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; font-size: 0.68rem; color: var(--st-text-2); }
  .fx-view label { display: flex; align-items: center; gap: 4px; }
  .fx-view select { font-size: 0.68rem; }
  .fx-view button { font-size: 0.68rem; padding: 1px 8px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); border-radius: 4px; cursor: pointer; }
  .fx-view button.on { border-color: var(--st-accent); color: var(--st-accent); }
  .fx-cut { display: inline-flex; align-items: center; gap: 3px; }
  .fx-cut button { padding: 0 5px; }
  .fx-point { font-size: 0.7rem; border-collapse: collapse; }
  .fx-point th, .fx-point td { padding: 1px 8px; text-align: right; font-variant-numeric: tabular-nums; }
  .fx-point th:first-child, .fx-point td:first-child { text-align: left; }
  .fx-cols { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 8px; }
  .fx-members h5 { margin: 0 0 4px; font-size: 0.74rem; }
  .fx-m { display: flex; flex-wrap: wrap; gap: 6px; font-size: 0.68rem; padding: 1px 0; border-bottom: 1px solid var(--st-hair); }
  .fx-c { color: var(--st-danger); }
  @media (max-width: 900px) { .fx-cols { grid-template-columns: 1fr; } }
</style>
