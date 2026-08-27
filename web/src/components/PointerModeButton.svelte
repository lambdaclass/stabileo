<script lang="ts">
  /**
   * Select or pan, on the model rather than in the ribbon.
   *
   * # Why it moved
   *
   * These two are not tasks, they are how you hold the mouse — the thing you
   * switch mid-gesture, twenty times while reading a result. They sat in the
   * ribbon among the commands that open panels, which put them in permanent
   * competition with everything else for what the ribbon highlights: after a
   * solve, a lit diagram plus a lit Select meant two commands claimed to be
   * the current activity while the right-hand panel could only show one.
   *
   * Moved here, that contradiction cannot arise. The ribbon highlights what the
   * panel is showing; the pointer mode is a property of the cursor and says so
   * where the cursor is.
   *
   * # Why a toggle rather than two buttons
   *
   * There are exactly two states and they are mutually exclusive, so a single
   * control that shows the CURRENT one and switches on click carries the same
   * information in half the space — and cannot display the impossible state of
   * both or neither, which two buttons can.
   */
  import { uiStore } from '../lib/store';
  import { t } from '../lib/i18n';
  import Icon from './ribbon/Icon.svelte';

  const tool = $derived(uiStore.currentTool);
  const isPan = $derived(tool === 'pan');
  const isSelect = $derived(tool === 'select');

  /*
   * A non-pointer tool (node, element, …) is NOT "Select", and showing the
   * select icon plus a "Mode: Select" tip while placing nodes was the button
   * lying about the state it claims to report. With a build tool armed the
   * button shows THAT tool; a click still lands on select, the one sensible
   * destination — sending a user mid node-placement to pan would strand the
   * tool they picked. Labels come from the float.* tool names, so no new
   * strings.
   */
  const TOOL_LABEL: Record<string, string> = {
    node: 'float.node',
    element: 'float.element',
    support: 'float.support',
    load: 'float.load',
    influenceLine: 'float.influenceLine',
  };
  /*
   * Icon.svelte has glyphs for the four build tools and nothing else — an
   * unknown name renders an EMPTY svg, so the influence-line tool (labelled
   * above) must not be passed through as an icon name.
   */
  const TOOL_ICON: Record<string, string> = {
    node: 'node', element: 'element', support: 'support', load: 'load',
  };
  const iconName = $derived(isPan ? 'pan' : isSelect ? 'select' : (TOOL_ICON[tool] ?? 'select'));
  /** What the mode IS — present tense, because that is what the reader is in. */
  const mode = $derived(
    isPan ? t('viewport.modePan')
    : isSelect ? t('viewport.modeSelect')
    : t(TOOL_LABEL[tool] ?? 'float.select'),
  );
  /** What the click WOULD do. Kept apart from the above: they are not the
      same tense and reading them as one sentence is how the old wording made
      people think the button described a state they were not in. */
  const action = $derived(
    isSelect ? t('viewport.clickToPan') : t('viewport.clickToSelect'),
  );

  function toggle() {
    /*
     * Assigned through the store's setter, which is where the rule lives that
     * arming an EDIT tool puts a diagram away. Select and pan are not edit
     * tools, so nothing is put away here — which is the whole point of them
     * being persistent.
     */
    uiStore.currentTool = isSelect ? 'pan' : 'select';
  }
</script>

<!--
  The tip is a sibling inside the wrapper rather than the native `title`,
  because it has to say three different KINDS of thing: what mode you are in,
  where the rest of that mode's setting lives, and what a click would do. A
  title attribute renders those as one run-on line with no way to rank them,
  and the note is deliberately the quietest of the three — it answers the
  question people arrive with ("it selects members and I want nodes") without
  competing with the two sentences that describe the button itself.
-->
<div class="pm-wrap">
  <button
    class="pointer-mode"
    class:panning={isPan}
    onclick={toggle}
    aria-label={isSelect ? t('viewport.switchToPan') : t('viewport.switchToSelect')}
    aria-pressed={isPan}
    data-testid="pointer-mode"
  >
    <Icon name={iconName} size={17} />
  </button>

  <div class="pm-tip" role="tooltip">
    <p class="pm-tip-mode">{mode}</p>
    <!--
      Only while selecting: pointed at the panel that decides WHAT a drag
      picks up. In pan mode — or with a build tool armed — there is no such
      setting in play and the sentence would be advice about a mode the user
      is not in.
    -->
    {#if isSelect}
      <p class="pm-tip-note">{t('viewport.selectKindHint')}</p>
    {/if}
    <p class="pm-tip-action">{action}</p>
  </div>
</div>

<style>
  .pm-wrap {
    position: relative;
    display: flex;
  }

  /*
   * Sized and skinned as the twin of zoom-to-fit directly below it. It had
   * been a ribbon-shaped tile — icon over label, 46 px tall and full width —
   * which read as a heading for the stack rather than a member of it. The
   * label is gone with it: two floating buttons in a column, one labelled and
   * one not, is the mismatch you notice before you read either.
   */
  .pointer-mode {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    background: color-mix(in srgb, var(--st-surface) 90%, transparent);
    color: var(--st-text-2);
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }

  .pointer-mode:hover {
    background: var(--st-surface-3);
    color: var(--st-text);
  }

  /*
   * Marked by TINT, never by the accent fill the ribbon uses for "this is what
   * the panel is showing". The pointer mode is a different kind of state — it
   * is always on, one way or the other — and painting it the same colour would
   * put a second thing on screen claiming to be the current activity, which is
   * exactly what moving it out of the ribbon was for.
   */
  .pointer-mode.panning {
    color: var(--st-value);
    border-color: color-mix(in srgb, var(--st-value) 45%, transparent);
  }

  .pm-tip {
    position: absolute;
    /* Opens leftward: the button is pinned to the right edge of the viewport
       and there is nothing to the right of it to open into. */
    right: calc(100% + 6px);
    top: 0;
    width: max-content;
    max-width: 220px;
    padding: 6px 8px;
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    background: var(--st-surface);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.18);
    /*
     * No fade and no delay. A tip that eases in is a tip you have already
     * started reading by the time it is legible, and this one is consulted
     * mid-gesture — the moment it is late is the moment it is useless.
     */
    display: none;
    z-index: 20;
  }

  /*
   * Hover only, plus keyboard focus.
   *
   * `:focus-within` was here and made the tip STICK after a click: the button
   * keeps focus, so the panel stayed open over the model with the pointer
   * somewhere else entirely. `:focus-visible` is the distinction that fixes
   * it — it is set when focus arrives by keyboard and not when it arrives by
   * mouse, which is exactly the difference between a reader who needs the tip
   * and one who has already acted on it.
   */
  .pm-wrap:hover .pm-tip,
  .pm-wrap:has(:focus-visible) .pm-tip {
    display: block;
  }

  .pm-tip p { margin: 0; }

  /* The mode you are in, stated plainly and first. */
  .pm-tip-mode {
    font-size: 0.72rem;
    line-height: 1.35;
    color: var(--st-text);
  }

  /*
   * A footnote to the mode above, not a third statement: smaller, dimmer and
   * tucked directly under it, so the eye takes it as a detail of "Select"
   * rather than as another thing the button does.
   */
  .pm-tip-note {
    margin-top: 3px !important;
    font-size: 0.62rem;
    line-height: 1.35;
    color: var(--st-text-3);
  }

  /* What a click would do — separated by a rule because it is the only line
     about the FUTURE, and running it together with the description of the
     current mode is how a reader ends up believing they are in the other one. */
  .pm-tip-action {
    margin-top: 7px !important;
    padding-top: 7px;
    border-top: 1px solid var(--st-hair);
    font-size: 0.68rem;
    line-height: 1.35;
    color: var(--st-text-2);
  }
</style>
