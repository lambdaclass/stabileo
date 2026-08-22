<script lang="ts">
  /**
   * The list of guided walkthroughs, in the Project panel.
   *
   * # Why here and not on a page
   *
   * `/demo` still opens the shortest one, because that is the link the landing
   * page hands to someone who has never seen the app. But a user who is
   * already inside and wants to know how selection works should not have to
   * leave and come back through a URL. The place they are already looking for
   * "what am I working on" is the Project panel, and a tutorial about the app
   * belongs beside the examples that are also handed to you rather than built.
   *
   * # Why the durations are shown
   *
   * They are the difference between a list someone tries and a list someone
   * closes. A reader deciding whether to start needs to know if this is a
   * tooltip or a hundred seconds of their afternoon, and refusing to say is
   * how a menu of seven items gets no clicks at all.
   */
  import { DEMOS, startDemo, type DemoGroup } from '../lib/tour/demos';
  import { t } from '../lib/i18n';

  let open = $state(false);

  const GROUPS: Array<{ id: DemoGroup; titleKey: string }> = [
    { id: 'basics', titleKey: 'demo.menu.basics' },
    { id: 'advanced', titleKey: 'demo.menu.advanced' },
  ];

  function run(id: string) {
    open = false;
    /*
     * A frame later: the menu is inside the panel a walkthrough may want to
     * point at, and starting one while its own trigger is still unmounting
     * measures a spotlight against an element that is on its way out.
     */
    setTimeout(() => startDemo(id), 60);
  }
</script>

<div class="dm">
  <button class="dm-toggle" onclick={() => (open = !open)} data-testid="demo-menu-toggle">
    <span>{open ? '▾' : '▸'} {t('demo.menu.title')}</span>
    <span class="dm-count">{DEMOS.length}</span>
  </button>

  {#if open}
    <p class="dm-sub">{t('demo.menu.subtitle')}</p>
    {#each GROUPS as group}
      {@const items = DEMOS.filter((d) => d.group === group.id)}
      {#if items.length}
        <div class="dm-group">{t(group.titleKey)}</div>
        <div class="dm-list">
          {#each items as demo}
            <button class="dm-item" onclick={() => run(demo.id)} data-testid={`demo-${demo.id}`}>
              <span class="dm-top">
                <span class="dm-name">{t(demo.titleKey)}</span>
                <span class="dm-secs">{demo.seconds}{t('demo.menu.seconds')}</span>
              </span>
              <span class="dm-desc">{t(demo.descKey)}</span>
            </button>
          {/each}
        </div>
      {/if}
    {/each}
  {/if}
</div>

<style>
  .dm { display: flex; flex-direction: column; }

  /*
   * The examples disclosure, exactly. It sits directly beneath one and does
   * the same thing — a header you press to reveal a list, with a count of what
   * is inside — so wearing a different shape would have claimed a difference
   * that is not there.
   */
  .dm-toggle {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 0.4rem 0.5rem;
    background: none;
    border: 1px solid var(--st-hair);
    border-radius: 4px;
    color: var(--st-text-2);
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 600;
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    transition: all 0.2s;
  }

  .dm-toggle:hover {
    background: var(--st-bg);
    color: var(--st-text);
  }

  .dm-count {
    font-size: 0.6rem;
    color: var(--st-text-3);
    font-family: var(--st-mono, monospace);
    text-transform: none;
    letter-spacing: normal;
  }

  .dm-sub {
    margin: 8px 0;
    font-size: 0.66rem;
    line-height: 1.4;
    color: var(--st-text-3);
  }

  .dm-group {
    margin: 8px 0 4px;
    font-size: 0.62rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--st-text-3);
  }

  .dm-list { display: flex; flex-direction: column; gap: 4px; }

  /* The example cards in PRO read the same way: name and a number on one line,
     the sentence that decides it underneath. */
  .dm-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 8px;
    text-align: left;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair);
    border-left: 2px solid transparent;
    border-radius: var(--st-radius, 3px);
    color: var(--st-text-2);
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }

  .dm-item:hover {
    background: var(--st-surface-3);
    border-left-color: var(--st-accent);
    color: var(--st-text);
  }

  .dm-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .dm-name { font-size: 0.76rem; font-weight: 600; }
  .dm-secs { font-size: 0.6rem; color: var(--st-text-3); font-family: var(--st-mono, monospace); }
  .dm-desc { font-size: 0.64rem; line-height: 1.35; color: var(--st-text-3); }
</style>
