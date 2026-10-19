<script lang="ts">
  /**
   * The member open on the desk: what it is and how it stands, the decision on its bars with the
   * buttons that change it (lock, revert, redesign, equalize), its checks with their notices, and
   * the copies of the level's bars.
   */
  import { materialCheckState } from '../../../lib/store/material-check.svelte';
  import SteelMemberSheet from './steel/SteelMemberSheet.svelte';
  import { modelStore, uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { verificationStore } from '../../../lib/store/verification.svelte';
  import { designRunStore } from '../../../lib/store/design-run.svelte';
  import { decisionState, equalizeFrom, recoverCopy, removeCopy, revertToProposal, saveCopy, setLocked, storedDecisions } from '../../../lib/store/design-decisions';
  import { sortedLevels } from '../../../lib/model/grid';
  import { deskUi } from '../../../lib/store/design-desk-ui.svelte';
  import { designTableUi } from '../design/design-table-ui.svelte';
  import { openRebar3DView } from '../../../lib/store/rebar-open';
  import VerificationDetail from '../design/VerificationDetail.svelte';
  import { copyFrame, equalizeFrames, framesOf } from '../../../lib/store/frame-equalize';
  import { jointChecks } from '../../../lib/store/joint-checks';
  import type { DeskRow } from './desk-rows';
  import BatchEditDialog from '../design/BatchEditDialog.svelte';
  import SectionAdviceDialog from '../design/SectionAdviceDialog.svelte';
  import LateralRoleField from './LateralRoleField.svelte';
  import { verdictReasons } from '../../../lib/store/member-verdict';
  import { selectAndFrame, showInModel } from '../../../lib/pro/design-navigation';
  import { runGlobalSolve } from '../../../lib/engine/live-calc';
  import { runSteelCheck } from '../../../lib/store/steel-check';
  import { fabricationMatters, loadHeightMatters } from '../../../lib/engine/codes/argentina/cirsoc301-verdict';

  let { rows }: { rows: DeskRow[] } = $props();
  const row = $derived(rows.find((r) => r.id === deskUi.selected));
  /*
   * The member's checks are drawn once: while the member list (a place of the canvas) has this
   * member's row open, the row carries them with its editors, and the sheet says so instead.
   */
  const openInList = $derived(deskUi.tab === 'list' && !!row && designTableUi.expandedId === row.id);
  const ctx = $derived(row ? verificationStore.contextFor(row.id) : undefined);
  /*
   * The headline is the member's verdict (`member-verdict.ts`), with what holds it; the ratio
   * beside it is its worst LOCAL check and says so.
   */
  const steel = $derived(row ? verificationStore.steelMap.get(row.id) : undefined);
  // A steel member's verdict carries its holds too: a limit state not evaluated, an undeclared fabrication.
  const verdict = $derived(row && (row.material === 'concrete' || (row.material === 'steel' && steel)) ? verificationStore.memberVerdict(row.id) : null);
  /*
   * Rolled or welded, declared on the section. Offered for the families whose checks read it (I,
   * channel, tee, box: `fabricationMatters`); a change edits the section, so the analysis is run again before the next check.
   */
  const steelSection = $derived.by(() => { void modelStore.sections; const e = row ? modelStore.elements.get(row.id) : undefined; return e ? modelStore.sections.get(e.sectionId) : undefined; });
  const fabricationOffered = $derived(!!steel && !!steelSection && fabricationMatters(steelSection.shape));
  /*
   * The edit is the section's, so it retires the analysis like any section edit (and undoes with
   * it). The member is then solved and checked again at once, so it answers on the datum declared.
   */
  async function setFabrication(value: string) {
    if (!steelSection || !row) return;
    const id = row.id;
    modelStore.updateSection(steelSection.id, { fabrication: value === 'rolled' || value === 'welded' ? value : undefined });
    await runGlobalSolve();
    runSteelCheck();
    deskUi.selected = id;
    note = t('steel.fabrication.note');
  }
  /*
   * Where the load acts (F.2.2), declared on the member: offered for the families whose flexure
   * reads it (I, channel: `loadHeightMatters`). It changes no analysis, only the check.
   */
  const steelMember = $derived.by(() => { void modelStore.elements; return row ? modelStore.elements.get(row.id) : undefined; });
  const loadHeightOffered = $derived(!!steel && !!steelSection && loadHeightMatters(steelSection.shape));
  function setLoadHeight(value: string) {
    if (!row) return;
    const id = row.id;
    modelStore.updateElement(id, { steelLoadHeight: value === 'web' || value === 'topFlange' ? value : undefined });
    runSteelCheck();
    deskUi.selected = id;
    note = t('steel.loadHeight.note');
  }
  const decision = $derived.by(() => { void modelStore.designDecisions; void modelStore.elements; return row ? decisionState(row.id) : 'none'; });
  const sameSection = $derived(row ? rows.filter((r) => r.id !== row.id && modelStore.elements.get(r.id)?.sectionId === modelStore.elements.get(row.id)?.sectionId && Math.abs(r.zTop - row.zTop) < 1e-3).map((r) => r.id) : []);
  const copies = $derived.by(() => { void modelStore.designDecisions; return storedDecisions().copies; });
  const levelName = $derived(sortedLevels(modelStore.grid).find((l) => Math.abs(l.z - (deskUi.levelZ ?? NaN)) < 1e-3));
  let note = $state<string | null>(null);
  /*
   * Batch edits and section advice, moved from the classic design table. The batch takes what is
   * selected in the model, or else this member and the ones of its section on its level.
   */
  let batch = $state<number[] | null>(null);
  const batchSet = $derived(row ? (uiStore.selectedElements.size > 1 ? [...uiStore.selectedElements].sort((a, b) => a - b) : [row.id, ...sameSection]) : []);
  const outcome = $derived.by(() => { void verificationStore.contexts; return row ? verificationStore.outcomeFor(row.id) : undefined; });
  let advice = $state(false);
  const frames = $derived.by(() => { void modelStore.elements; return row && row.material === 'concrete' ? framesOf(row.id) : null; });
  const myJoints = $derived.by(() => { void verificationStore.contexts; return row && ctx?.elementType === 'column' ? jointChecks().filter((j) => j.columnId === row.id) : []; });
  const others = $derived(frames?.group ? frames.group.lines.filter((l) => l.id !== frames.line.id) : []);

  function redesign() {
    if (!row) return;
    const o = designRunStore.designOne(row.id);
    note = o ? t(`desk.outcome.${o.outcome}`) : t('desk.cannotDesign');
  }
  function saveLevelCopy() {
    const label = levelName ? `${levelName.name} · ${new Date().toLocaleString()}` : `${t('desk.allLevels')} · ${new Date().toLocaleString()}`;
    saveCopy(label, levelName?.id);
    note = t('desk.copySaved');
  }
</script>

{#if batch}
  <BatchEditDialog selection={batch} sourceLabel={t('desk.batchSource')} onClose={() => (batch = null)} onApplied={(n) => { note = tp('design.batch.apply', { n }); }} />
{/if}
{#if advice && outcome?.sectionAdvice}
  <SectionAdviceDialog {outcome} guard={{ iterations: 0, lastArea: 0, lastGoverningDemand: 0 }} onClose={() => (advice = false)} onApplied={() => { advice = false; note = t('design.advice.preliminary'); }} />
{/if}

<aside class="di" data-testid="desk-inspector">
  {#if !row}
    <p class="di-hint">{t('desk.pickMember')}</p>
  {:else}
    <header class="di-head">
      <h4>{row.name}</h4>
      <span class="di-status st-{row.status}" data-testid="desk-status" data-status={row.status}>{t(`desk.f.${row.status === 'provisional' ? 'fail' : row.status === 'stale' ? 'unavailable' : row.status}`)}{row.ratio !== null ? ` · ${t('verdict.local.ratio')} ${row.ratio.toFixed(2)}` : ''}</span>
      <span class="di-decision" data-testid="desk-decision">{t(`desk.d.${decision}`)}</span>
    </header>
    {#if verdict && verdict.holds.length}
      <p class="di-holds" data-testid="desk-status-holds">{tp('verdict.member.heldBy', { reasons: verdictReasons({ ...verdict, assumptions: [] }, tp).join('; ') })}</p>
    {/if}
    <div class="di-actions">
      {#if decision === 'locked'}
        <button onclick={() => setLocked([row.id], false)} data-testid="desk-unlock">{t('desk.unlock')}</button>
      {:else}
        <button disabled={decision === 'none'} onclick={() => setLocked([row.id], true)} data-testid="desk-lock">{t('desk.lock')}</button>
      {/if}
      {#if row.material === 'concrete'}
        <button disabled={decision !== 'edited'} onclick={() => revertToProposal([row.id])} data-testid="desk-revert">{t('desk.revert')}</button>
        <button disabled={decision === 'locked'} onclick={redesign} data-testid="desk-redesign">{t('desk.redesign')}</button>
        <button disabled={decision === 'none' || sameSection.length === 0} onclick={() => { note = tp('desk.equalized', { n: equalizeFrom(row.id, sameSection).length }); }} data-testid="desk-equalize">{tp('desk.equalize', { n: sameSection.length })}</button>
        <button onclick={() => { uiStore.selectElement(row.id, false); const r = openRebar3DView(); if (!r.ok) note = t('detailing.doc.noCoordinated'); }} data-testid="desk-open-3d">{t('desk.rebar3d')}</button>
      {/if}
    </div>
    {#if row.material === 'concrete'}
      <div class="di-actions">
        <button disabled={batchSet.length === 0} onclick={() => (batch = batchSet)} data-testid="desk-batch">{tp('desk.batch', { n: batchSet.length })}</button>
        {#if outcome?.sectionAdvice}<button onclick={() => (advice = true)} data-testid="desk-advice">{t('desk.advice')}</button>{/if}
      </div>
    {/if}
    <!-- The member is the model's selection already: frame it in the viewer beside design, or
         leave design for the model stage with the viewer framing it (`design-navigation.ts`). -->
    <div class="di-actions">
      <button class="di-open-frame" onclick={() => selectAndFrame([row.id])} data-testid="desk-frame-piece">{t('desk.framePiece')}</button>
      <button class="di-open-frame" onclick={() => showInModel([row.id])} data-testid="desk-show-in-model">{t('desk.showInModel')}</button>
    </div>
    {#if note}<p class="di-note" role="status">{note}</p>{/if}

    {#if ctx?.elementType === 'beam' && row.material === 'concrete'}<LateralRoleField elementId={row.id} />{/if}
    {#if ctx?.elementType === 'column'}
      <button class="di-open-frame" onclick={() => (deskUi.tab = 'column')} data-testid="desk-open-column">{t('desk.openColumn')}</button>
    {/if}
    {#if myJoints.length}
      <section class="di-frame" data-testid="desk-joint">
        <h5>{t('desk.jointTop')}</h5>
        {#each myJoints as j (j.direction)}
          <p class="di-hint" class:st-fail={j.check.status === 'FAIL'}>{j.direction}: {j.check.status === 'UNSUPPORTED' ? t('desk.jointNa') : tp('desk.jointLine', { vu: Math.abs(j.check.Vu).toFixed(0), vn: j.check.phiVn.toFixed(0), u: j.check.utilization.toFixed(2) })} · {j.combo}</p>
        {/each}
      </section>
    {/if}

    {#if frames}
      <section class="di-frame" data-testid="desk-frame">
        <h5>{tp('desk.frameOf', { label: frames.line.label, n: frames.line.members.length })}</h5>
        {#if others.length === 0}
          <p class="di-hint">{t('desk.frameUnique')}</p>
        {:else}
          <p class="di-hint">{tp('desk.frameRepeats', { n: others.length })} {others.map((l) => l.label).join(' · ')}</p>
          <div class="di-actions">
            <button onclick={() => { note = tp('desk.frameCopied', { n: copyFrame(frames.line, others).length }); }} data-testid="desk-frame-copy">{tp('desk.frameCopy', { n: others.length })}</button>
            <button onclick={() => { note = tp('desk.equalized', { n: equalizeFrames(frames.group!).length }); }} data-testid="desk-frame-equalize">{tp('desk.frameEqualize', { n: others.length + 1 })}</button>
          </div>
        {/if}
        <button class="di-open-frame" onclick={() => (deskUi.tab = 'frame')} data-testid="desk-open-frame">{t('desk.openFrame')}</button>
      </section>
    {/if}

    {#if row.material === 'concrete' && ctx && openInList}
      <!-- The member list has this member's row open, with these same checks and its editors. -->
      <p class="di-hint" data-testid="desk-inspector-in-list">{t('desk.inspectorInList')}</p>
    {:else if row.material === 'concrete' && ctx}
      <VerificationDetail elementId={row.id} {ctx} provided={verificationStore.providedFor(row.id) ?? null} outcome={verificationStore.outcomeFor(row.id)} onApplyAdvice={() => {}} />
    {:else if row.material !== 'concrete' && row.material !== 'steel'}
      {@const res = materialCheckState.results.get(row.id)}
      {#if res}<SteelMemberSheet rows={res.rows} elementId={row.id} note={t(`mat.note.${res.family}`)} />{/if}
    {:else if row.material === 'steel' && !steel}
      <ul class="di-notices">{#each row.codes as c}<li><b>{c}</b> {t(`notice.${c}.cause`)} <span class="di-fix">{t(`notice.${c}.fix`)}</span></li>{/each}</ul>
    {:else if steel}
      {#if fabricationOffered && steelSection}
        <label class="di-fab" data-testid="desk-steel-fabrication">{t('steel.fabrication.label')}
          <select value={steelSection.fabrication ?? ''} onchange={(e) => setFabrication((e.currentTarget as HTMLSelectElement).value)}>
            <option value="">{t('steel.fabrication.undeclared')}</option>
            <option value="rolled">{t('steel.fabrication.rolled')}</option>
            <option value="welded">{t('steel.fabrication.welded')}</option>
          </select>
        </label>
      {/if}
      {#if loadHeightOffered}
        <label class="di-fab" data-testid="desk-steel-load-height">{t('steel.loadHeight.label')}
          <select value={steelMember?.steelLoadHeight ?? ''} onchange={(e) => setLoadHeight((e.currentTarget as HTMLSelectElement).value)}>
            <option value="">{t('steel.loadHeight.undeclared')}</option>
            <option value="topFlange">{t('steel.loadHeight.topFlange')}</option>
            <option value="web">{t('steel.loadHeight.web')}</option>
          </select>
        </label>
      {/if}
      <SteelMemberSheet v={steel} />
    {/if}
  {/if}

  <section class="di-copies" data-testid="desk-copies">
    <h5>{t('desk.copies')}</h5>
    <button onclick={saveLevelCopy} data-testid="desk-save-copy">{levelName ? tp('desk.saveCopyLevel', { level: levelName.name }) : t('desk.saveCopyAll')}</button>
    <ul>
      {#each copies as c (c.id)}
        <li>
          <span class="di-copy">{c.label} ({Object.keys(c.byElement).length})</span>
          <button onclick={() => { note = tp('desk.recovered', { n: recoverCopy(c.id) }); }} data-testid="desk-recover-copy">{t('desk.recover')}</button>
          <button onclick={() => removeCopy(c.id)} title={t('grid.remove')}>×</button>
        </li>
      {/each}
    </ul>
  </section>
</aside>

<style>
  .di { width: 24rem; padding: 8px; border-left: 1px solid var(--st-hair); overflow: auto; display: flex; flex-direction: column; gap: 6px; }
  /* Narrower windows: the sheet gives the canvas between it and the rail the width it needs. */
  @media (max-width: 1280px) { .di { width: 20rem; } }
  @media (max-width: 1100px) { .di { width: 16rem; } }
  @media (max-width: 960px) { .di { width: 14rem; } }
  @media (max-width: 767px) { .di { width: auto; border-left: none; } }
  .di-hint { color: var(--st-text-3); font-size: 0.72rem; }
  .di-fab { display: flex; gap: 6px; align-items: baseline; font-size: 0.7rem; color: var(--st-text-2); }
  .di-fab select { font-size: 0.7rem; }
  .di-holds { margin: 0; font-size: 0.72rem; color: var(--st-text); border-left: 2px solid var(--st-warn); padding-left: 6px; }
  .di-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
  .di-head h4 { margin: 0; font-size: 0.82rem; flex: 1 1 100%; }
  .di-status { font-size: 0.7rem; padding: 0 6px; border-radius: 8px; border: 1px solid var(--st-hair-strong); }
  .di-status.st-ok { border-color: var(--st-ok); } .di-status.st-warn { border-color: var(--st-warn); }
  .di-status.st-fail, .di-status.st-provisional { border-color: var(--st-danger); }
  .di-decision { font-size: 0.68rem; color: var(--st-text-2); }
  .di-actions { display: flex; flex-wrap: wrap; gap: 4px; }
  .di-actions button, .di-copies button { font-size: 0.68rem; padding: 2px 8px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); border-radius: 4px; cursor: pointer; }
  .di-actions button:disabled { opacity: 0.45; cursor: default; }
  .di-note { font-size: 0.68rem; color: var(--st-text-2); border-left: 2px solid var(--st-accent); padding-left: 6px; margin: 0; }
  .di-steel { font-size: 0.7rem; border-collapse: collapse; }
  .di-steel td { padding: 1px 6px; border-top: 1px solid var(--st-hair); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .di-notices { list-style: none; margin: 0; padding: 0; font-size: 0.7rem; }
  .di-fix { color: var(--st-text-2); }
  .di-copies, .di-frame { border-top: 1px solid var(--st-hair); padding-top: 6px; }
  .di-frame h5 { margin: 0 0 4px; font-size: 0.74rem; }
  .di-hint.st-fail { color: var(--st-danger); }
  .di-open-frame { margin-top: 4px; font-size: 0.68rem; padding: 2px 8px; border: 1px solid var(--st-accent); background: var(--st-surface); color: var(--st-text); border-radius: 4px; cursor: pointer; }
  .di-copies h5 { margin: 0 0 4px; font-size: 0.74rem; }
  .di-copies ul { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .di-copies li { display: flex; align-items: center; gap: 4px; font-size: 0.68rem; }
  .di-copy { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
