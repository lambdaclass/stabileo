<script lang="ts">
  /**
   * A language chooser that opens over itself.
   *
   * ── Why not a native `<select>` ────────────────────────────────────
   *
   * It was one, and that is exactly the problem the reader reported: the
   * browser draws the popup, the platform decides where, and on macOS it
   * lands offset from the control — floating beside it rather than belonging
   * to it. No amount of CSS reaches inside a native popup, so the only way to
   * make the list feel attached to the button is to draw it.
   *
   * ── What has to be kept, having given up the native control ────────
   *
   * A `<select>` brings keyboard support, focus handling and a screen-reader
   * contract for free, and a div with click handlers throws all three away.
   * So: `role="listbox"` with `aria-selected` on the options, arrow keys and
   * Home/End to walk them, Enter or Space to take one, Escape to leave with
   * the value untouched, and focus returning to the button afterwards —
   * otherwise the tab order restarts at the top of the page.
   */
  interface Props {
    /** The value currently chosen. */
    value: string;
    /** The values on offer, in the order to show them. */
    options: readonly string[];
    /** How to render one — a name, not a code. */
    label: (code: string) => string;
    onChange: (code: string) => void;
    /** For the screen reader, since the button shows only a language name. */
    ariaLabel: string;
    /** Opens upward where the control sits near the bottom of the screen. */
    drop?: 'down' | 'up';
    testid?: string;
  }

  let {
    value, options, label, onChange, ariaLabel, drop = 'down', testid = 'locale-select',
  }: Props = $props();

  let open = $state(false);
  let active = $state(0);
  let button = $state<HTMLButtonElement | null>(null);
  let list = $state<HTMLDivElement | null>(null);

  function show() {
    active = Math.max(options.indexOf(value), 0);
    open = true;
  }

  function choose(code: string) {
    onChange(code);
    open = false;
    button?.focus();
  }

  function onKey(e: KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); open = false; button?.focus(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % options.length; return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + options.length) % options.length; return; }
    if (e.key === 'Home') { e.preventDefault(); active = 0; return; }
    if (e.key === 'End') { e.preventDefault(); active = options.length - 1; return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(options[active]); }
  }

  /* A click anywhere else closes it, the way a native popup does. */
  $effect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (button?.contains(t) || list?.contains(t)) return;
      open = false;
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  });
</script>

<div class="ls" class:up={drop === 'up'} data-testid={testid}>
  <button
    bind:this={button}
    class="ls-btn"
    class:on={open}
    type="button"
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-label={ariaLabel}
    onclick={() => (open ? (open = false) : show())}
    onkeydown={onKey}
    data-testid="{testid}-button"
  >
    <span class="ls-value">{label(value)}</span>
    <span class="ls-caret" aria-hidden="true"></span>
  </button>

  {#if open}
    <!--
      Anchored to the button's own box and overlapping it by a hair, so the
      list reads as the control unfolding rather than as a second thing that
      appeared nearby. That overlap is the whole difference the reader asked
      for, and it is one line of `top`.
    -->
    <div
      bind:this={list}
      class="ls-list"
      role="listbox"
      tabindex="-1"
      aria-label={ariaLabel}
      onkeydown={onKey}
      data-testid="{testid}-list"
    >
      {#each options as code, i (code)}
        <button
          type="button"
          role="option"
          aria-selected={code === value}
          class="ls-opt"
          class:active={i === active}
          class:on={code === value}
          onclick={() => choose(code)}
          onmouseenter={() => (active = i)}
        >
          {label(code)}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .ls {
    position: relative;
    display: inline-flex;
  }

  .ls-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius);
    background: var(--st-surface-2);
    color: var(--st-text-2);
    font: inherit;
    font-size: 0.78rem;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
  }

  .ls-btn:hover { color: var(--st-text); border-color: var(--st-accent); }

  /*
     While the list is down the button is its head, not a separate control:
     the accent border runs through both and the bottom corners square off so
     the two read as one shape.
  */
  .ls-btn.on {
    border-color: var(--st-accent);
    color: var(--st-text);
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  .ls.up .ls-btn.on {
    border-radius: var(--st-radius);
    border-top-left-radius: 0;
    border-top-right-radius: 0;
  }

  .ls-caret {
    width: 0;
    height: 0;
    border-left: 3.5px solid transparent;
    border-right: 3.5px solid transparent;
    border-top: 4px solid currentColor;
    opacity: 0.8;
    flex: none;
  }

  .ls-list {
    position: absolute;
    left: 0;
    right: 0;
    /* Overlaps the button's border by 1 px — one shape, not two. */
    top: calc(100% - 1px);
    z-index: 60;
    min-width: 100%;
    padding: 2px;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--st-accent);
    border-top-color: var(--st-hair);
    border-radius: 0 0 var(--st-radius) var(--st-radius);
    background: var(--st-surface);
    box-shadow: 0 10px 20px -10px rgba(0, 0, 0, 0.55);
  }

  .ls.up .ls-list {
    top: auto;
    bottom: calc(100% - 1px);
    border-radius: var(--st-radius) var(--st-radius) 0 0;
    border-top-color: var(--st-accent);
    border-bottom-color: var(--st-hair);
  }

  .ls-opt {
    padding: 0.3rem 0.45rem;
    border: none;
    border-radius: 3px;
    background: none;
    color: var(--st-text-2);
    font: inherit;
    font-size: 0.78rem;
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
  }

  .ls-opt.active { background: var(--st-surface-3); color: var(--st-text); }
  .ls-opt.on { color: var(--st-accent); }
</style>
