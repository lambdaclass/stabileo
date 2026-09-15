<script lang="ts">
  /**
   * The shell both double-click editors sit in.
   *
   * ── Why it is shared ───────────────────────────────────────────────
   *
   * There were two of these, written apart, and they had drifted into two
   * different cards: same job, same shape, different paddings and a palette
   * each. Everything here is chrome — the frame, the title, the dragging, the
   * way it stays on screen — and none of it is about nodes or members.
   *
   * ── Draggable, because it lands on what you were looking at ────────
   *
   * The card opens over the thing you double-clicked, which is exactly the
   * part of the model you now cannot see. Rather than guess a better place,
   * it can be pushed aside by its title bar and stays where it was put for
   * as long as it is open.
   *
   * Dragging is by POINTER events on the header, not the whole card: a drag
   * that started anywhere would fight every text selection inside it.
   */
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    /** Where the model was clicked, in screen coordinates. */
    anchor: { x: number; y: number };
    onClose: () => void;
    onKeydown?: (e: KeyboardEvent) => void;
    children: Snippet;
    footer?: Snippet;
    testid?: string;
  }

  let { title, anchor, onClose, onKeydown, children, footer, testid = 'editor-card' }: Props = $props();

  let card = $state<HTMLDivElement | null>(null);
  /** Offset applied by dragging, in pixels. Reset when the card reopens. */
  let drag = $state({ dx: 0, dy: 0 });
  let from: { x: number; y: number; dx: number; dy: number } | null = null;

  /* A fresh open is a fresh position: a card left far away would seem lost. */
  $effect(() => {
    void anchor.x;
    void anchor.y;
    drag = { dx: 0, dy: 0 };
  });

  /**
   * Keep the card on screen.
   *
   * Measured after render, so a card that grew — the member editor gains rows
   * as releases are switched on — is clamped at its real height rather than
   * the one it had when it opened.
   */
  const at = $derived.by(() => {
    let x = anchor.x + drag.dx;
    let y = anchor.y + drag.dy;
    if (card) {
      const r = card.getBoundingClientRect();
      const halfW = r.width / 2;
      x = Math.min(Math.max(x, halfW + 8), window.innerWidth - halfW - 8);
      y = Math.min(Math.max(y, 8), window.innerHeight - r.height - 8);
    }
    return { x, y };
  });

  function grab(e: PointerEvent) {
    /* Left button only; a right-click on the header is not a drag. */
    if (e.button !== 0) return;
    from = { x: e.clientX, y: e.clientY, dx: drag.dx, dy: drag.dy };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function move(e: PointerEvent) {
    if (!from) return;
    drag = { dx: from.dx + (e.clientX - from.x), dy: from.dy + (e.clientY - from.y) };
  }

  function drop(e: PointerEvent) {
    if (!from) return;
    from = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }
</script>

<!--
  A backdrop that only closes. It takes the click so the model behind does not
  also react to it — double-clicking a member and then clicking away should
  dismiss the card, not select whatever was underneath.
-->
<button class="ec-backdrop" onclick={onClose} aria-label={title} tabindex="-1"></button>

<div
  bind:this={card}
  class="ec"
  style="left: {at.x}px; top: {at.y}px;"
  onkeydown={onKeydown}
  role="dialog"
  aria-label={title}
  tabindex="-1"
  data-testid={testid}
>
  <div
    class="ec-head"
    onpointerdown={grab}
    onpointermove={move}
    onpointerup={drop}
    onpointercancel={drop}
    data-testid="{testid}-head"
  >
    <span class="ec-title">{title}</span>
    <button class="ec-close" onclick={onClose} aria-label="×" title="×">×</button>
  </div>

  <div class="ec-body">{@render children()}</div>

  {#if footer}
    <div class="ec-foot">{@render footer()}</div>
  {/if}
</div>

<style>
  .ec-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
    border: none;
    padding: 0;
    background: transparent;
    cursor: default;
  }

  .ec {
    position: fixed;
    z-index: 100;
    transform: translate(-50%, 10px);
    min-width: 210px;
    max-width: 300px;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    background: var(--st-surface);
    box-shadow: 0 12px 28px -10px rgba(0, 0, 0, 0.6);
    font-size: 0.72rem;
  }

  .ec-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.35rem 0.35rem 0.55rem;
    border-bottom: 1px solid var(--st-hair);
    /* The grip is the whole bar, so say so before the pointer is pressed. */
    cursor: grab;
    touch-action: none;
    user-select: none;
  }

  .ec-head:active { cursor: grabbing; }

  .ec-title {
    flex: 1;
    font-family: var(--st-mono);
    font-size: 0.66rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--st-text-2);
  }

  .ec-close {
    width: 18px;
    height: 18px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 3px;
    background: none;
    color: var(--st-text-3);
    font-size: 0.9rem;
    line-height: 1;
    cursor: pointer;
  }

  .ec-close:hover { background: var(--st-surface-3); color: var(--st-text); }

  .ec-body {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.55rem;
  }

  .ec-foot {
    display: flex;
    justify-content: flex-end;
    gap: 0.35rem;
    padding: 0.45rem 0.55rem;
    border-top: 1px solid var(--st-hair);
  }
</style>
