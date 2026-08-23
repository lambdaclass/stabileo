<script lang="ts">
  import { t } from '../lib/i18n';

  /**
   * The phone sheet's resize handle — the ONE thing on a sheet that drags.
   *
   * ## Why this is its own component
   *
   * Basic's panel had it and PRO's did not, which is the kind of difference
   * nobody decides — it just follows from which surface was built first. Both
   * are the same object: a panel that shares the screen with the model along
   * the vertical axis, where the reader's needs pull in opposite directions
   * (reading a table wants height, reading a diagram wants none).
   *
   * ## Dragging is not scrolling
   *
   * This handle is the only surface that resizes; the body below keeps ordinary
   * `overflow-y: auto`. What makes that hold is `touch-action: none` here —
   * without it the browser claims the gesture as a scroll and a drag on the
   * handle flings the list underneath instead of moving the sheet.
   *
   * ## The height is published, not owned
   *
   * `--st-sheet-h` goes on the ROOT element because two boxes need it: the
   * sheet's own, and the padding `.app-body` reserves so the canvas is really
   * the size it looks. The token in `styles/tokens.css` is the value it opens
   * at; this overrides it once the reader has an opinion, and remembers.
   */

  type Props = {
    /**
     * Where the chosen height is remembered. Separate keys per surface: PRO's
     * panel and Basic's hold different things and a reader who wants one tall
     * has not said anything about the other.
     */
    storageKey: string;
    /** Called when a drag ENDS — see below. */
    onResizeEnd?: () => void;
  };
  let { storageKey, onResizeEnd }: Props = $props();

  const MIN = 22;
  const MAX = 86;
  const DEFAULT = 45;

  function stored(): number {
    try {
      const v = Number(localStorage.getItem(storageKey));
      return Number.isFinite(v) && v >= MIN && v <= MAX ? v : DEFAULT;
    } catch { return DEFAULT; }
  }

  let vh = $state(stored());
  let dragging = $state(false);
  let frame = 0;

  function publish() {
    // One decimal: a pointer delta over a viewport hundredth produces fifteen
    // significant figures, and every one past the first lands in the DOM.
    document.documentElement.style.setProperty('--st-sheet-h', `${vh.toFixed(1)}vh`);
  }

  $effect(() => {
    publish();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      // Handed back on unmount, so `.app-body` stops reserving height for a
      // panel that is no longer there.
      document.documentElement.style.removeProperty('--st-sheet-h');
    };
  });

  function start(e: PointerEvent) {
    dragging = true;
    const startY = e.clientY;
    const startVh = vh;
    const unit = window.innerHeight / 100;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);

    const move = (ev: PointerEvent) => {
      // Dragging UP grows the sheet, which is the direction it grows on screen.
      vh = Math.min(MAX, Math.max(MIN, startVh + (startY - ev.clientY) / unit));
      if (!frame) {
        frame = requestAnimationFrame(() => { frame = 0; publish(); });
      }
    };

    const up = () => {
      dragging = false;
      try { localStorage.setItem(storageKey, String(Math.round(vh))); } catch { /* private mode */ }
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      /*
       * Re-frame once, at the END. The canvas has just changed height by as
       * much as 60 % of the screen, so the framing that preceded the drag is
       * wrong for what is left — but doing it per pointermove makes the model
       * chase the handle and re-fits against a canvas still being resized.
       */
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.dispatchEvent(new Event('stabileo-zoom-to-fit'));
        onResizeEnd?.();
      }));
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    e.preventDefault();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="grab"
  class:dragging
  onpointerdown={start}
  role="separator"
  aria-orientation="horizontal"
  aria-label={t('ribbon.resize')}
  data-testid="sheet-grab"
>
  <span class="pill"></span>
</div>

<style>
  .grab {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 26px;
    flex: none;
    cursor: row-resize;
    /* The line that keeps a drag here from becoming a scroll down there. */
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
  }

  .pill {
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: var(--st-hair-strong);
    transition: background 0.15s, width 0.15s;
  }

  .grab:active .pill,
  .grab.dragging .pill {
    background: var(--st-accent);
    width: 56px;
  }

  .grab:focus-visible { outline: 2px solid var(--st-accent); outline-offset: -3px; }
</style>
