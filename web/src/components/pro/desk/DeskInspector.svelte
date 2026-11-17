<script lang="ts">
  import OutdatedNotice from '../design/OutdatedNotice.svelte';
  /** The member open on the desk: what it is and how it stands, and its checks. */
  import { materialCheckState } from '../../../lib/store/material-check.svelte';
  import SteelMemberSheet from './steel/SteelMemberSheet.svelte';
  import { modelStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { verificationStore } from '../../../lib/store/verification.svelte';
  import { deskUi } from '../../../lib/store/design-desk-ui.svelte';
  import { memberNames } from '../../../lib/store/member-names';
  import { verdictReasons } from '../../../lib/store/member-verdict';
  import { selectAndFrame, showInModel } from '../../../lib/pro/design-navigation';
  import { runGlobalSolve } from '../../../lib/engine/live-calc';
  import { runSteelCheck } from '../../../lib/store/steel-check';
  import { fabricationMatters, loadHeightMatters } from '../../../lib/engine/codes/argentina/cirsoc301-verdict';
  import { steelInputCompleteness } from '../../../lib/engine/verification-service';
  import { STEEL_INPUTS_MISSING } from '../../../lib/engine/design/notice-catalogue';

  const DISPLAY: Record<string, string> = { ok: 'ok', nearLimit: 'warn', fail: 'fail', notVerified: 'unavailable', unsupported: 'unavailable' };

  const id = $derived(deskUi.selected);
  const element = $derived.by(() => { void modelStore.elements; return id !== null ? modelStore.elements.get(id) : undefined; });
  const section = $derived.by(() => { void modelStore.sections; return element ? modelStore.sections.get(element.sectionId) : undefined; });
  const name = $derived(element ? `${memberNames().name(element.id)} · ${section?.name ?? '—'}` : '');
  const steel = $derived(element ? verificationStore.steelMap.get(element.id) : undefined);
  const other = $derived(element ? materialCheckState.results.get(element.id) : undefined);
  const status = $derived(steel && element ? verificationStore.getDisplayStatus(element.id) : other ? DISPLAY[other.status] ?? 'unavailable' : null);
  const ratio = $derived(steel && element ? verificationStore.getDisplayRatio(element.id) : other ? other.utilization : null);
  /* A steel member whose section the check cannot read: shown, unchecked, saying why. */
  const unreadable = $derived.by(() => {
    if (!element || steel || other) return false;
    const m = modelStore.model;
    return steelInputCompleteness({ elements: m.elements, nodes: m.nodes, sections: m.sections, materials: m.materials, supports: m.supports } as never).some((g) => g.elementId === element.id);
  });
  const verdict = $derived(steel && element ? verificationStore.memberVerdict(element.id) : null);
  /*
   * Rolled or welded, declared on the section. Offered for the families whose checks read it (I,
   * channel, tee, box: `fabricationMatters`); a change edits the section, so the analysis is run
   * again and the member checked at once, on the datum declared.
   */
  const fabricationOffered = $derived(!!steel && !!section && fabricationMatters(section.shape));
  async function setFabrication(value: string) {
    if (!section || !element) return;
    const keep = element.id;
    modelStore.updateSection(section.id, { fabrication: value === 'rolled' || value === 'welded' ? value : undefined });
    await runGlobalSolve();
    runSteelCheck();
    deskUi.selected = keep;
    note = t('steel.fabrication.note');
  }
  /* Where the load acts (F.2.2), declared on the member: it changes no analysis, only the check. */
  const loadHeightOffered = $derived(!!steel && !!section && loadHeightMatters(section.shape));
  function setLoadHeight(value: string) {
    if (!element) return;
    const keep = element.id;
    modelStore.updateElement(keep, { steelLoadHeight: value === 'web' || value === 'topFlange' ? value : undefined });
    runSteelCheck();
    deskUi.selected = keep;
    note = t('steel.loadHeight.note');
  }
  let note = $state<string | null>(null);
</script>

<aside class="di" data-testid="desk-inspector">
  <OutdatedNotice audit={[]} />
  {#if element && unreadable}
    <h4 data-member-id={element.id}>{name}</h4>
    <ul class="di-notices"><li><b>{STEEL_INPUTS_MISSING.code}</b> {t(`notice.${STEEL_INPUTS_MISSING.code}.cause`)} <span class="di-fix">{t(`notice.${STEEL_INPUTS_MISSING.code}.fix`)}</span></li></ul>
  {:else if !element || (!steel && !other)}
    <p class="di-hint">{t('desk.pickMember')}</p>
  {:else}
    <header class="di-head">
      <h4 data-member-id={element.id}>{name}</h4>
      {#if status}<span class="di-status st-{status}" data-testid="desk-status" data-status={status} data-local={verdict?.local}>{t(`desk.f.${status === 'provisional' ? 'fail' : status === 'stale' ? 'unavailable' : status}`)}{ratio !== null ? ` · ${t('verdict.local.ratio')} ${ratio.toFixed(2)}` : ''}</span>{/if}
    </header>
    {#if verdict && verdict.holds.length}
      <p class="di-holds" data-testid="desk-status-holds">{tp('verdict.member.heldBy', { reasons: verdictReasons({ ...verdict, assumptions: [] }, tp).join('; ') })}</p>
    {/if}
    <div class="di-actions">
      <button class="di-open-frame" onclick={() => selectAndFrame([element.id])} data-testid="desk-frame-piece">{t('desk.framePiece')}</button>
      <button class="di-open-frame" onclick={() => showInModel([element.id])} data-testid="desk-show-in-model">{t('desk.showInModel')}</button>
    </div>
    {#if note}<p class="di-note" role="status">{note}</p>{/if}

    {#if other}
      <SteelMemberSheet rows={other.rows} elementId={element.id} note={t(`mat.note.${other.family}`)} />
    {:else if steel}
      {#if fabricationOffered && section}
        <label class="di-fab" data-testid="desk-steel-fabrication">{t('steel.fabrication.label')}
          <select value={section.fabrication ?? ''} onchange={(e) => setFabrication((e.currentTarget as HTMLSelectElement).value)}>
            <option value="">{t('steel.fabrication.undeclared')}</option>
            <option value="rolled">{t('steel.fabrication.rolled')}</option>
            <option value="welded">{t('steel.fabrication.welded')}</option>
          </select>
        </label>
      {/if}
      {#if loadHeightOffered}
        <label class="di-fab" data-testid="desk-steel-load-height">{t('steel.loadHeight.label')}
          <select value={element.steelLoadHeight ?? ''} onchange={(e) => setLoadHeight((e.currentTarget as HTMLSelectElement).value)}>
            <option value="">{t('steel.loadHeight.undeclared')}</option>
            <option value="topFlange">{t('steel.loadHeight.topFlange')}</option>
            <option value="web">{t('steel.loadHeight.web')}</option>
          </select>
        </label>
      {/if}
      <SteelMemberSheet v={steel} />
    {/if}
  {/if}
</aside>

<style>
  .di { width: 24rem; padding: 8px; border-left: 1px solid var(--st-hair); overflow: auto; display: flex; flex-direction: column; gap: 6px; }
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
  .di-actions { display: flex; flex-wrap: wrap; gap: 4px; }
  .di-note { font-size: 0.68rem; color: var(--st-text-2); border-left: 2px solid var(--st-accent); padding-left: 6px; margin: 0; }
  .di-notices { list-style: none; margin: 0; padding: 0; font-size: 0.7rem; }
  .di-fix { color: var(--st-text-2); }
  .di-open-frame { margin-top: 4px; font-size: 0.68rem; padding: 2px 8px; border: 1px solid var(--st-accent); background: var(--st-surface); color: var(--st-text); border-radius: 4px; cursor: pointer; }
</style>
