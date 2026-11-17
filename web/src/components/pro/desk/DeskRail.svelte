<script lang="ts">
  /**
   * The rail: the places of design. The design data, the steel (its profiles and its
   * connections), the other code, the pieces that are not members and the drawings, with the
   * specialties and the project's own surfaces in menus at the foot. Every entry opens a place of
   * the desk, with the viewer where it is.
   */
  import { t } from '../../../lib/i18n';
  import { deskUi, DESK_GROUPS, groupOf, type DeskTab } from '../../../lib/store/design-desk-ui.svelte';
  import { openDeskAt } from '../../../lib/pro/design-navigation';

  const group = $derived(groupOf(deskUi.tab));
  let menu = $state<'specialties' | 'project' | null>(null);
  const go = (k: DeskTab) => { menu = null; openDeskAt(k); };
  const on = (k: DeskTab) => deskUi.tab === k;
</script>

<nav class="dr" aria-label={t('desk.views')} data-testid="desk-rail">
  <button class:on={on('designData')} onclick={() => go('designData')} data-testid="desk-rail-designData">{t('designData.title')}</button>
  <p class="dr-sec">{t('desk.rail.steel')}</p>
  <button class:on={on('steel')} onclick={() => go('steel')} data-testid="desk-rail-steel">{t('desk.rail.profiles')}</button>
  <button class:on={on('connections')} onclick={() => go('connections')} data-testid="desk-rail-connections">{t('desk.rail.connections')}</button>
  <p class="dr-sec" aria-hidden="true"></p>
  <button class:on={on('codes')} onclick={() => go('codes')} title={t('desk.codes.desc')} data-testid="desk-rail-codes">{t('desk.rail.otherCodes')}</button>
  <button class:on={group === 'piece'} onclick={() => go(group === 'piece' ? deskUi.tab : 'joint')} data-testid="desk-mode-piece">{t('desk.mode.piece')}</button>
  {#if group === 'piece'}
    <div class="dr-sub" role="group" aria-label={t('desk.mode.piece')}>
      {#each DESK_GROUPS.piece as k (k)}<button class:on={on(k)} onclick={() => go(k)} data-testid="desk-tab-{k}">{t(`desk.tab.${k}`)}</button>{/each}
    </div>
  {/if}
  <button class:on={on('sheets')} onclick={() => go('sheets')} title={t('desk.tab.sheetsHint')} data-testid="desk-rail-sheets">{t('desk.tab.sheets')}</button>
  <div class="dr-menus">
    {#each (['specialties', 'project'] as const) as key (key)}
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
</nav>

<style>
  .dr { display: flex; flex-direction: column; gap: 1px; padding: 6px 8px; width: 17rem; box-sizing: border-box; overflow: auto; flex: 1; min-height: 0; }
  @media (max-width: 1100px) { .dr { width: 14rem; } }
  @media (max-width: 960px) { .dr { width: 12rem; } }
  .dr-sub { display: flex; flex-wrap: wrap; gap: 2px; padding: 2px 0 4px 10px; }
  .dr button { text-align: left; white-space: nowrap; font-size: 0.72rem; padding: 2px 8px; border: 1px solid transparent; background: none; color: var(--st-text-2); border-radius: 4px; cursor: pointer; }
  .dr button:hover:not(:disabled) { background: var(--st-surface-3); color: var(--st-text); }
  .dr-sub button { font-size: 0.68rem; padding: 1px 6px; border-color: var(--st-hair); }
  .dr .on { border-color: var(--st-accent); color: var(--st-text); }
  .dr-sec { margin: 6px 0 1px; font-family: var(--st-mono); font-size: 0.6rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--st-text-3); }
  .dr-sec:empty { margin: 3px 0 0; border-top: 1px solid var(--st-hair); }
  .dr-menus { display: flex; gap: 4px; margin-top: 6px; }
  .dr-menus .dr-menu > button { border-color: var(--st-hair-strong); }
  .dr-menu { position: relative; }
  .dr-menu-list { position: absolute; left: 0; top: calc(100% + 2px); z-index: 5; display: flex; flex-direction: column; gap: 2px; padding: 4px; min-width: 12rem; background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: 4px; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25); }
  .dr-menu-list button { text-align: left; }
  @media (max-width: 767px) {
    .dr { flex-direction: row; flex-wrap: nowrap; align-items: center; width: 100%; overflow-x: auto; gap: 4px; padding: 4px 8px; }
    .dr-sec { display: none; }
    .dr-sub { flex-wrap: nowrap; padding: 0; }
    .dr-menus { margin-top: 0; }
    .dr-menu-list { position: fixed; left: 8px; top: auto; }
  }
</style>
