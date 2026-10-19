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
  import { areaAt, memberOffsets } from '../../../../lib/engine/design/beam-line';
  import { lineDemand } from '../../../../lib/engine/design/beam-line-demand';
  import { computeFlexureCapacity, requiredLd } from '../../../../lib/engine/station-design-forces';
  import FrameElevation from './FrameElevation.svelte';
  import FramePanel from './FramePanel.svelte';
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

  /** Open the member's line: its kept draft when there is one, else what the members hold. */
  function load() {
    const o = openLine(memberId);
    line = o?.line ?? null; draft = o?.model ?? null; saved = o?.saved ?? false;
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
  const demand = $derived.by(() => {
    if (!line || !draft) return [];
    const offs = memberOffsets(draft);
    return lineDemand(line.members.map((id, i) => ({ ctx: verificationStore.contextFor(id), offset: offs[i]!, L: draft!.lengths[i]!, forward: line!.forward[i] !== false })));
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
    {#if note}<p class="fx-hint" role="status">{note}</p>{/if}
    <FrameElevation line={draft} {faces} {demand} selectedBar={selBar} secondBar={selBar2} selectedZone={selZone} {pointX} {failing}
      onBar={onBar} onZone={(id) => { selZone = id; selBar = selBar2 = null; }} onPoint={(x) => (pointX = x)} />
    <p class="fx-legend"><span class="need">- -</span> {t('frameEd.needed')} · <span class="give">—</span> {t('frameEd.provided')}</p>
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
        <h5>{t('frameEd.members')}</h5>
        {#each line.members as id, i (id)}
          {@const v = verdicts.get(id)}
          <div class="fx-m" class:bad={failing.has(id)}>
            <span>{i + 1} · #{id}</span>
            <span>{v ? v.worstUtilization.toFixed(2) : '—'}</span>
            {#if v}{#each v.checks.filter((c: { status: string }) => c.status === 'fail').slice(0, 3) as c}<span class="fx-c">{c.category}</span>{/each}{/if}
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
  .need { color: var(--st-danger); } .give { color: var(--st-ok); }
  .fx-point { font-size: 0.7rem; border-collapse: collapse; }
  .fx-point th, .fx-point td { padding: 1px 8px; text-align: right; font-variant-numeric: tabular-nums; }
  .fx-point th:first-child, .fx-point td:first-child { text-align: left; }
  .fx-cols { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 8px; }
  .fx-members h5 { margin: 0 0 4px; font-size: 0.74rem; }
  .fx-m { display: flex; flex-wrap: wrap; gap: 6px; font-size: 0.68rem; padding: 1px 0; border-bottom: 1px solid var(--st-hair); }
  .fx-c { color: var(--st-danger); }
  @media (max-width: 900px) { .fx-cols { grid-template-columns: 1fr; } }
</style>
