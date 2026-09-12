<script module lang="ts">
  /* Unique ids for the tip → trigger association below. */
  let helpTipSeq = 0;
</script>

<script lang="ts">
  /**
   * A hover explanation for a control that cannot explain itself.
   *
   * # Why not the native title
   *
   * Half a dozen settings already used `title`, and it is the wrong tool for
   * a sentence: the OS renders it in its own font at its own width, ignores
   * the app's theme entirely, and on a narrow panel wraps a two-line
   * explanation into a ribbon of text that runs off the screen. It also
   * cannot be styled, which means the one place the app explains itself looks
   * like it belongs to a different program.
   *
   * # Why a delay, when the pointer tip has none
   *
   * They answer different questions. The pointer tip is consulted DURING a
   * gesture — late is useless. These sit in a list of a dozen checkboxes that
   * a reader scans on the way to the one they came for, and a tip that fires
   * instantly turns that scan into a flicker of popups. Waiting for a
   * deliberate pause is the difference between answering a question and
   * interrupting.
   *
   * Cleared on leave, so a pointer passing over three settings in half a
   * second opens none of them.
   */
  import { onDestroy } from 'svelte';

  interface Props {
    /** The explanation. One or two sentences; it is a hint, not documentation. */
    text: string;
    /** Milliseconds of hovering before it opens. */
    delay?: number;
    /** Which side to open towards, when the default would run off the panel. */
    side?: 'left' | 'right';
    children?: import('svelte').Snippet;
  }

  const { text, delay = 700, side = 'left', children }: Props = $props();

  let open = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  /*
   * role="tooltip" only reaches a screen reader if the trigger points at it,
   * and the trigger here is whatever the caller wrapped — a snippet this
   * component cannot put attributes on. So the association is made at the
   * moment it matters: focus opens the tip, and the focused element gets
   * aria-describedby for exactly as long as it keeps the focus.
   */
  const tipId = `helptip-${++helpTipSeq}`;

  function arm() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { open = true; }, delay);
  }

  /* Pinned by a click; hovering away must not undo a deliberate ask. */
  let pinned = $state(false);

  function disarm() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!pinned) open = false;
  }

  function onFocusIn(e: FocusEvent) {
    open = true;
    (e.target as HTMLElement | null)?.setAttribute?.('aria-describedby', tipId);
  }

  function onFocusOut(e: FocusEvent) {
    (e.target as HTMLElement | null)?.removeAttribute?.('aria-describedby');
    disarm();
  }

  /*
   * A click opens it too, and keeps it open.
   *
   * Hover is a preference, not a contract: it does not exist on a touch
   * screen, and on a desktop a reader who has decided they want the
   * explanation should not have to hold still for 700 ms to get it. Pressing
   * the thing that looks like a question is the obvious way to ask, and a `?`
   * that answers to nothing but patience reads as a dead control — which is
   * exactly how PRO's were reported.
   *
   * Toggles, so the same press puts it away.
   */
  function toggle(e: MouseEvent) {
    e.stopPropagation();
    if (timer) { clearTimeout(timer); timer = null; }
    pinned = !pinned;
    open = pinned;
  }

  /* Pinned open by a click, a tip has to close on the next click elsewhere —
     otherwise it follows the reader around the panel. */
  $effect(() => {
    if (!open) return;
    const away = () => { pinned = false; open = false; };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  });

  /* A pending timer that fires after the component is gone would set state on
     a destroyed component — harmless today, a leak the moment this is used in
     a list that re-renders. */
  onDestroy(() => { pinned = false; disarm(); });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<span
  class="ht-wrap"
  onmouseenter={arm}
  onmouseleave={disarm}
  onfocusin={onFocusIn}
  onfocusout={onFocusOut}
  onmousedown={(e) => e.stopPropagation()}
  onclick={toggle}
>
  {@render children?.()}
  {#if open}
    <span class="ht-tip" class:right={side === 'right'} id={tipId} role="tooltip">{text}</span>
  {/if}
</span>

<style>
  .ht-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: inherit;
  }

  .ht-tip {
    position: absolute;
    /* Opens away from the panel it lives in, which is docked right. */
    right: calc(100% + 8px);
    top: 50%;
    transform: translateY(-50%);
    width: max-content;
    max-width: 230px;
    padding: 6px 8px;
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    background: var(--st-surface);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.18);
    font-size: 0.66rem;
    line-height: 1.4;
    font-weight: 400;
    text-transform: none;
    letter-spacing: normal;
    white-space: normal;
    color: var(--st-text-2);
    pointer-events: none;
    z-index: 40;
  }

  .ht-tip.right {
    right: auto;
    left: calc(100% + 8px);
  }
</style>
