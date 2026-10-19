<script lang="ts">
  /**
   * The rail: the places of the step in hand, under the step's name. Preparing lists the model and
   * its pieces and the design data; sizing lists the concrete (by floor, by piece, as the member
   * list), the steel (its profiles and its connections), the other code and what is pending, with
   * the specialties in a menu; detailing lists the coordinated detailing and the 3-D view;
   * documenting, the documents. The project's own surfaces are a menu at the foot of every step.
   *
   * Every entry opens a place of the desk, with the viewer where it is; none of them leaves the
   * Design stage any more. The steps themselves are at the top (`DeskProcessBar.svelte`).
   */
  import { t, tp } from '../../../lib/i18n';
  import { deskUi, DESK_GROUPS, groupOf, stepOf, type DeskTab } from '../../../lib/store/design-desk-ui.svelte';
  import { openDeskAt } from '../../../lib/pro/design-navigation';
  import { canOpenRebar3D, openRebar3DView, rebar3DMissingSteps } from '../../../lib/store/rebar-open';
  import { verificationStore } from '../../../lib/store/verification.svelte';
  import { untrack } from 'svelte';

  let { pendingCount, empty, place }: { pendingCount: number; empty: boolean; place: DeskTab } = $props();

  const step = $derived(stepOf(place) ?? 'size');
  const group = $derived(groupOf(deskUi.tab));
  const can3d = $derived(deskUi.open && canOpenRebar3D());
  const why3d = $derived.by(() => { const m = rebar3DMissingSteps().map((k) => t(k)); return m.length ? `${t('proRibbon.blockedIntro')}: ${m.join(' · ')}` : t('detailing.doc.noCoordinated'); });
  let menu = $state<'specialties' | 'project' | null>(null);
  let note = $state<string | null>(null);

  /** The editor for a member: a beam's frame, a column's stack. */
  const pieceTabOf = (id: number | null): DeskTab | null => {
    const k = id !== null ? verificationStore.contextFor(id)?.elementType : undefined;
    return k === 'beam' ? 'frame' : k === 'column' ? 'column' : null;
  };
  let lastPiece = $state<DeskTab>('frame');
  $effect(() => { if (group === 'piece') untrack(() => { lastPiece = deskUi.tab; }); });
  const go = (k: DeskTab) => { menu = null; note = null; openDeskAt(k); };
  function openPiece() { go(pieceTabOf(deskUi.selected) ?? lastPiece); }
  /** The 3-D reinforcement view, on top of design, on the member design is on. */
  function open3d() {
    note = null;
    const r = openRebar3DView();
    if (!r.ok) note = t('detailing.doc.noCoordinated');
  }
  const on = (k: DeskTab) => place === k;
</script>

<nav class="dr" aria-label={t('desk.views')} data-testid="desk-rail" data-step={step}>
  <p class="dr-step">{t(`desk.step.${step}`)}</p>
  {#if step === 'prepare'}
    <button class:on={on('prepare')} onclick={() => go('prepare')} data-testid="desk-rail-prepare">{t('desk.rail.model')}</button>
    <button class:on={on('designData')} onclick={() => go('designData')} data-testid="desk-rail-designData">{t('designData.title')}</button>
  {:else if step === 'size'}
    <p class="dr-sec">{t('desk.rail.concrete')}</p>
    <button class:on={on('plan') && !empty} onclick={() => go('plan')} data-testid="desk-tab-plan">{t('desk.tab.plan')}</button>
    <button class:on={on('levels')} onclick={() => go('levels')} data-testid="desk-tab-levels">{t('desk.tab.levels')}</button>
    <button class:on={group === 'piece'} onclick={openPiece} data-testid="desk-mode-piece">{t('desk.mode.piece')}</button>
    {#if group === 'piece'}
      <div class="dr-sub" role="group" aria-label={t('desk.mode.piece')}>
        {#each DESK_GROUPS.piece as k (k)}<button class:on={on(k)} onclick={() => go(k)} data-testid="desk-tab-{k}">{t(`desk.tab.${k}`)}</button>{/each}
      </div>
    {/if}
    <button class:on={on('list')} onclick={() => go('list')} title={t('desk.cmd.listDesc')} data-testid="desk-rail-list">{t('desk.rail.list')}</button>
    <p class="dr-sec">{t('desk.rail.steel')}</p>
    <button class:on={on('steel')} onclick={() => go('steel')} data-testid="desk-rail-steel">{t('desk.rail.profiles')}</button>
    <button class:on={on('connections')} onclick={() => go('connections')} data-testid="desk-rail-connections">{t('desk.rail.connections')}</button>
    <p class="dr-sec" aria-hidden="true"></p>
    <button class:on={on('codes')} onclick={() => go('codes')} title={t('desk.codes.desc')} data-testid="desk-rail-codes">{t('desk.rail.otherCodes')}</button>
    <button class:on={group === 'pending'} onclick={() => go('report')} data-testid="desk-mode-pending">{tp('desk.mode.pending', { n: pendingCount })}</button>
    {#if group === 'pending'}
      <div class="dr-sub" role="group" aria-label={tp('desk.mode.pending', { n: pendingCount })}>
        {#each DESK_GROUPS.pending as k (k)}<button class:on={on(k)} onclick={() => go(k)} data-testid="desk-tab-{k}">{t(`desk.tab.${k}`)}</button>{/each}
      </div>
    {/if}
  {:else if step === 'detail'}
    <button class:on={on('detailing')} onclick={() => go('detailing')} data-testid="desk-rail-detailing">{t('desk.rail.detailing')}</button>
    <!-- Disabled for want of something, it names what, in text a screen reader reaches (as the ribbon's did). -->
    <button disabled={!can3d} onclick={open3d} title={can3d ? t('desk.rail.rebar3dHint') : why3d} aria-describedby={can3d ? undefined : 'desk-rail-3d-why'} data-testid="desk-rail-3d">{t('desk.rebar3d')}</button>
    {#if !can3d}<span class="sr-only" id="desk-rail-3d-why" data-testid="desk-rail-3d-why">{why3d}</span>{/if}
  {:else}
    <button class:on={on('documents')} onclick={() => go('documents')} data-testid="desk-rail-documents">{t('desk.tab.documents')}</button>
  {/if}
  <div class="dr-menus">
    {#each (step === 'size' ? ['specialties', 'project'] : ['project']) as g (g)}
      {@const key = g as 'specialties' | 'project'}
      <div class="dr-menu">
        <button class:on={group === key} aria-expanded={menu === key} onclick={() => (menu = menu === key ? null : key)} data-testid="desk-menu-{key}">{t(`desk.menu.${key}`)} ▾</button>
        {#if menu === key}
          <div class="dr-menu-list" role="menu">
            {#each DESK_GROUPS[key] as k (k)}<button role="menuitem" class:on={on(k)} onclick={() => go(k)} data-testid="desk-tab-{k}">{t(`desk.tab.${k}`)}</button>{/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>
  {#if note}<p class="dr-note" role="status">{note}</p>{/if}
</nav>

<style>
  .dr { display: flex; flex-direction: column; gap: 1px; padding: 6px 8px; width: 17rem; box-sizing: border-box; overflow: auto; max-height: 55%; flex: none; }
  @media (max-width: 1100px) { .dr { width: 14rem; } }
  @media (max-width: 960px) { .dr { width: 12rem; } }
  .dr-step { margin: 0 0 4px; font-size: 0.78rem; font-weight: 600; color: var(--st-text); }
  .dr-sub { display: flex; flex-wrap: wrap; gap: 2px; padding: 2px 0 4px 10px; }
  .dr button { text-align: left; white-space: nowrap; font-size: 0.72rem; padding: 2px 8px; border: 1px solid transparent; background: none; color: var(--st-text-2); border-radius: 4px; cursor: pointer; }
  .dr button:hover:not(:disabled) { background: var(--st-surface-3); color: var(--st-text); }
  .dr button:disabled { opacity: 0.45; cursor: default; }
  .dr-sub button { font-size: 0.68rem; padding: 1px 6px; border-color: var(--st-hair); }
  .dr .on { border-color: var(--st-accent); color: var(--st-text); }
  .dr-sec { margin: 6px 0 1px; font-family: var(--st-mono); font-size: 0.6rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--st-text-3); }
  .dr-sec:empty { margin: 3px 0 0; border-top: 1px solid var(--st-hair); }
  .dr-menus { display: flex; gap: 4px; margin-top: 6px; }
  .dr-menus .dr-menu > button { border-color: var(--st-hair-strong); }
  .dr-note { margin: 4px 0 0; font-size: 0.68rem; color: var(--st-text-2); border-left: 2px solid var(--st-accent); padding-left: 6px; }
  .dr-menu { position: relative; }
  .dr-menu-list { position: absolute; left: 0; top: calc(100% + 2px); z-index: 5; display: flex; flex-direction: column; gap: 2px; padding: 4px; min-width: 12rem; background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: 4px; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25); }
  .dr-menu-list button { text-align: left; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  /*
   * A short window (≤ 600 px): the places in two columns, the headings across both, so the member
   * list under them keeps its height instead of being squeezed into what is left of the strip.
   */
  @media (max-height: 600px) and (min-width: 768px) {
    .dr { display: grid; grid-template-columns: 1fr 1fr; align-content: start; column-gap: 4px; max-height: none; padding: 4px 8px; }
    .dr-step, .dr-sec, .dr-sub, .dr-menus, .dr-note { grid-column: 1 / -1; }
    .dr button { overflow: hidden; text-overflow: ellipsis; }
  }
  /* A phone: the places in one row, scrolled sideways, over the canvas. */
  @media (max-width: 767px) {
    .dr { flex-direction: row; flex-wrap: nowrap; align-items: center; width: 100%; max-height: none; overflow-x: auto; gap: 4px; padding: 4px 8px; }
    .dr-step, .dr-sec { display: none; }
    .dr-sub { flex-wrap: nowrap; padding: 0; }
    .dr-menus { margin-top: 0; }
    .dr-menu-list { position: fixed; left: 8px; top: auto; }
  }
</style>
