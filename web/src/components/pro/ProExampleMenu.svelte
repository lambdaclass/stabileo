<script lang="ts">
  /**
   * The example gallery, as its own overlay.
   *
   * ── Why it left `ProPanel` ─────────────────────────────────────────
   *
   * It is a fixed-position overlay anchored to a button that lives in another component
   * entirely — the ribbon calls `ProPanel.examples(btn)` and hands its own element over — plus
   * a viewport-measuring positioner and a hundred and thirty lines of card styling. None of it
   * has anything to do with routing tabs, gating a solve or assembling a report, which is what
   * the rest of that panel does.
   *
   * ── The positioning is measured, not guessed ───────────────────────
   *
   * The menu is `position: fixed`, so it is placed against the VIEWPORT and re-placed on resize
   * and on scroll. Two regimes, because they are genuinely different problems:
   *
   *   mobile   full width under the header. There is no anchor worth aligning to at that width,
   *            and aligning to one would push a 720 px card grid off-screen.
   *   desktop  right-aligned to the anchor, then clamped into the viewport on both axes. The
   *            clamp is what keeps a button near the right edge from opening a menu that starts
   *            off-screen — `Math.max(12, …)` is the left guard and it must not be dropped for
   *            reading like a redundant `Math.min`.
   *
   * `open` is the parent's state, not this component's: the ribbon opens the menu from outside
   * the panel, and a second copy of that flag here is a second answer to whether it is open.
   */
  import { tick } from 'svelte';
  import { t } from '../../lib/i18n';
  import { uiStore } from '../../lib/store';
  import { isHeavyExample, type ProExample, type ProExampleGroup } from '../../lib/data/pro-examples';

  type Props = {
    open: boolean;
    groups: ProExampleGroup[];
    /** The control the menu hangs from. Null on mobile, where it is not aligned to anything. */
    anchor: HTMLElement | null;
    onpick: (ex: ProExample) => void;
    onclose: () => void;
  };
  let { open, groups, anchor, onpick, onclose }: Props = $props();

  let style = $state('');

  function place() {
    if (!open || typeof window === 'undefined') return;
    if (uiStore.isMobile) {
      const width = window.innerWidth - 16;
      const top = 48;
      const maxHeight = window.innerHeight - top - 60;
      style = `left:8px;top:${top}px;width:${width}px;max-height:${maxHeight}px;`;
      return;
    }
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(720, window.innerWidth - 24);
    const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
    const top = Math.min(rect.bottom + 6, window.innerHeight - 120);
    const maxHeight = Math.max(260, Math.min(560, window.innerHeight - top - 16));
    style = `left:${left}px;top:${top}px;width:${width}px;max-height:${maxHeight}px;`;
  }

  // Placed once the menu is in the DOM: `place()` reads the anchor's box, and on the tick the
  // flag flips the anchor may not have been laid out beside a panel that just became visible.
  $effect(() => {
    if (!open) return;
    void anchor;
    tick().then(place);
  });
</script>

<svelte:window onresize={place} onscroll={place} />

{#if open}
  <div class="pro-example-backdrop" onclick={onclose}></div>
  <div class="pro-example-menu" style={style} data-testid="pro-example-menu">
    <div class="pro-example-menu-head">
      <div class="pro-example-menu-title">{t('pro.exampleTitle')}</div>
      <div class="pro-example-menu-subtitle">{t('pro.examples.subtitle')}</div>
    </div>
    {#each groups as group (group.group)}
      <section class="pro-example-group">
        <div class="pro-example-group-title">{group.title}</div>
        <div class="pro-example-grid">
          {#each group.examples as ex (ex.nameKey)}
            <button class="pro-example-item" class:pro-example-featured={ex.featured} onclick={() => onpick(ex)}>
              <div class="pro-example-topline">
                <span class="pro-example-name">{t(ex.nameKey)}</span>
                <span class="pro-example-purpose">{t(ex.purposeKey)}</span>
              </div>
              <span class="pro-example-desc">{t(ex.descKey)}</span>
              <div class="pro-example-tags">
                {#each ex.tags as tag}
                  <span class="pro-example-tag">{t(tag)}</span>
                {/each}
              </div>
              <div class="pro-example-stats">
                <span>{ex.stats.nodes} {t('pro.stats.nodes')}</span>
                <span>{ex.stats.members} {t('pro.stats.members')}</span>
                {#if ex.stats.shells}
                  <span>{ex.stats.shells} {t('pro.stats.shells')}</span>
                {/if}
                {#if isHeavyExample(ex)}
                  <span class="pro-example-heavy">{t('pro.stats.heavy')}</span>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      </section>
    {/each}
  </div>
{/if}

<style>
  .pro-example-backdrop {
    position: fixed;
    inset: 0;
    z-index: 219;
    background: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .pro-example-menu {
    position: fixed;
    overflow-y: auto;
    background: linear-gradient(180deg, var(--st-surface-3) 0%, var(--st-surface-3) 100%);
    border: 1px solid var(--st-info);
    border-radius: 10px;
    box-shadow: 0 20px 48px rgba(0, 0, 0, 0.42);
    padding: 8px;
    z-index: 220;
  }

  .pro-example-menu-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 8px 10px;
    border-bottom: 1px solid var(--st-hair-strong);
    margin-bottom: 8px;
  }

  .pro-example-menu-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--st-text);
  }

  .pro-example-menu-subtitle {
    font-size: 0.66rem;
    color: var(--st-info);
    letter-spacing: 0.02em;
  }

  .pro-example-group {
    padding: 0 6px 10px;
  }

  .pro-example-group + .pro-example-group {
    border-top: 1px solid var(--st-hair-strong);
    padding-top: 10px;
  }

  .pro-example-group-title {
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--st-info);
    padding: 0 2px 8px;
  }

  .pro-example-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .pro-example-item {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 10px 11px;
    background: rgba(18, 42, 74, 0.72);
    border: 1px solid var(--st-hair-strong);
    border-radius: 8px;
    color: var(--st-text);
    cursor: pointer;
    text-align: left;
    min-height: 124px;
    transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
  }

  .pro-example-item:hover {
    background: var(--st-surface-3);
    border-color: var(--st-info);
    transform: translateY(-1px);
  }

  .pro-example-topline {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .pro-example-name {
    font-size: 0.77rem;
    font-weight: 700;
    color: var(--st-text);
    overflow-wrap: break-word;
    word-break: break-word;
  }

  .pro-example-purpose {
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--st-warn);
  }

  .pro-example-desc {
    font-size: 0.66rem;
    color: var(--st-info);
    line-height: 1.3;
    overflow-wrap: break-word;
    word-break: break-word;
  }

  .pro-example-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .pro-example-tag {
    display: inline-flex;
    align-items: center;
    padding: 2px 6px;
    border-radius: 999px;
    background: rgba(217, 164, 65, 0.12);
    border: 1px solid rgba(217, 164, 65, 0.18);
    color: var(--st-warn);
    font-size: 0.56rem;
    font-weight: 600;
    letter-spacing: 0.03em;
  }

  .pro-example-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: auto;
    font-size: 0.58rem;
    color: var(--st-info);
  }

  .pro-example-heavy {
    color: var(--st-warn);
    font-style: italic;
  }

  .pro-example-featured {
    border-color: #f0a50044;
  }
  .pro-example-featured:hover {
    border-color: #f0a500aa;
  }

  @media (max-width: 720px) {
    .pro-example-menu {
      width: min(420px, calc(100vw - 16px));
    }
    .pro-example-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
