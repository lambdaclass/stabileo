<script lang="ts">
  import { onMount } from 'svelte';
  import { tPublic as t, i18n } from '../../lib/i18n/store.svelte';
  import {
    NODES, MEMBERS, DECK, SUPPORTS, FORCE_MAX, FORCE_EPS, DISP_SCALE, stateAt,
  } from './truss-data';

  /**
   * Draws the solved response of the truss in ./truss-data.ts. Nothing here
   * invents a force or a deflection: the arrow position selects a load case
   * (or a linear blend of two adjacent ones) and every colour, width and
   * coordinate below follows from that solved state.
   */
  type Props = {
    /** `animate` sweeps the load across the deck; `still` pins it at `position`. */
    mode?: 'animate' | 'still';
    /** Load position along the deck, 0 = left support, 1 = right support. */
    position?: number;
    /** Drop the legend and shrink the labels, for the side-by-side comparison. */
    compact?: boolean;
    /** Translation key for the caption shown under a compact still frame. */
    captionKey?: string;
    prefersReducedMotion?: boolean;
    paused?: boolean;
  };
  let {
    mode = 'animate', position = 0.5, compact = false, captionKey = '', prefersReducedMotion = false, paused: held = false,
  }: Props = $props();

  const REPRESENTATIVE = 0.5;
  /**
   * The sweep stops just short of the supports. A load sitting exactly over a
   * support is carried straight into it and every member goes to zero — true,
   * but a blank truss reads as a broken render, and wrapping from one support
   * to the other makes the load appear to teleport. It travels back and forth
   * instead, always over loaded deck.
   */
  const SWEEP_MIN = 0.08;
  const SWEEP_MAX = 0.92;

  let s = $state(mode === 'still' ? position : prefersReducedMotion ? REPRESENTATIVE : SWEEP_MIN);
  let direction = 1;
  let paused = $state(false);
  let hovered = $state(false);
  let focused = $state(false);

  const running = $derived(mode === 'animate' && !prefersReducedMotion && !held && !hovered && !focused);
  const state = $derived(stateAt(mode === 'still' ? position : s));

  onMount(() => {
    if (mode !== 'animate') return;
    let raf = 0;
    let last = performance.now();
    const SECONDS_PER_SWEEP = 9;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (prefersReducedMotion) s = REPRESENTATIVE;
      else if (running) {
        s += (direction * dt * (SWEEP_MAX - SWEEP_MIN)) / SECONDS_PER_SWEEP;
        if (s >= SWEEP_MAX) { s = SWEEP_MAX; direction = -1; }
        else if (s <= SWEEP_MIN) { s = SWEEP_MIN; direction = 1; }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  const nodeIndex = new Map(NODES.map((n, i) => [n.id, i]));

  /** Node position with the solved displacement applied, in drawing units. */
  function at(id: string) {
    const i = nodeIndex.get(id)!;
    const n = NODES[i];
    const d = state.displacements;
    return { x: n.x + d[2 * i] * DISP_SCALE, y: n.y + d[2 * i + 1] * DISP_SCALE };
  }

  /** Undeformed reference position. */
  function ref(id: string) {
    const n = NODES[nodeIndex.get(id)!];
    return { x: n.x, y: n.y };
  }

  /**
   * One global scale for every frame: intensity is `|N| / FORCE_MAX`, never
   * renormalised per frame, so a pale member really is carrying less than a
   * saturated one in a different frame.
   */
  function paint(force: number) {
    const mag = Math.abs(force) / FORCE_MAX;
    if (Math.abs(force) < FORCE_EPS) {
      return { stroke: 'var(--tf-zero)', width: 1.1, opacity: 0.55 };
    }
    return {
      stroke: force > 0 ? 'var(--tf-tension)' : 'var(--tf-compression)',
      width: 1.5 + 2.1 * mag,
      opacity: 0.42 + 0.58 * mag,
    };
  }

  /** Where the arrow sits: on the deformed deck, blended exactly like the load. */
  const loadPoint = $derived.by(() => {
    const p = mode === 'still' ? position : s;
    const tt = Math.min(1, Math.max(0, p)) * (DECK.length - 1);
    const i = Math.min(DECK.length - 2, Math.floor(tt));
    const w = tt - i;
    const a = at(DECK[i]);
    const b = at(DECK[i + 1]);
    return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w };
  });

  const deckLeft = $derived(at('B0'));
  const deckRight = $derived(at('B6'));

  const forceRange = $derived({ max: Math.max(0, ...state.forces), min: Math.min(0, ...state.forces) });
  const fmtP = $derived(new Intl.NumberFormat(i18n.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

  const titleId = `tf-title-${Math.round(position * 1000)}-${mode}`;
  const descId = `tf-desc-${Math.round(position * 1000)}-${mode}`;
</script>

<figure class="truss-fig" class:compact>
  <!--
    The viewBox ends just below the bearings. The old 200-unit height reserved
    a band under the deck for a load caption that no longer exists: the arrow
    carries that meaning on its own, and the <desc> carries it for screen
    readers.
  -->
  <svg
    viewBox={compact ? '24 8 512 150' : '0 -48 560 270'}
    role="img"
    aria-labelledby="{titleId} {descId}"
    onpointerenter={(e) => { if (e.pointerType === 'mouse') hovered = true; }}
    onpointerleave={() => (hovered = false)}
    onfocusin={() => (focused = true)}
    onfocusout={() => (focused = false)}
  >
    <title id={titleId}>{t('landing.figTitle')}</title>
    <desc id={descId}>{t('landing.figDesc')}</desc>

    <g>

    <!-- undeformed reference -->
    <g class="tf-ghost" aria-hidden="true">
      {#each MEMBERS as m}
        {@const a = ref(m.a)}
        {@const b = ref(m.b)}
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      {/each}
    </g>

    <!-- solved members, coloured by axial force -->
    <g class="tf-members" aria-hidden="true">
      {#each MEMBERS as m, k}
        {@const a = at(m.a)}
        {@const b = at(m.b)}
        {@const p = paint(state.forces[k])}
        <line
          x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          stroke={p.stroke}
          stroke-width={m.kind === 'bottom' ? p.width + 1.1 : p.width}
          opacity={p.opacity}
        />
      {/each}
    </g>

    <!-- deck line, drawn heavier so the load path is explicit -->
    <g class="tf-deck-rule" aria-hidden="true">
      <line x1={deckLeft.x} y1={deckLeft.y + 7} x2={deckRight.x} y2={deckRight.y + 7} />
    </g>

    <g class="tf-nodes" aria-hidden="true">
      {#each NODES as n}
        {@const p = at(n.id)}
        <circle cx={p.x} cy={p.y} r="2.4" />
      {/each}
    </g>

    <!-- supports, drawn on the solved node coordinates so they cannot drift -->
    <g class="tf-supports" aria-hidden="true">
      {#each SUPPORTS as sup}
        {@const p = at(sup.node)}
        <path d="M{p.x} {p.y} l-8 14 h16 z" />
        <line x1={p.x - 12} y1={p.y + 14} x2={p.x + 12} y2={p.y + 14} />
        {#if sup.kind === 'roller'}
          <circle class="tf-roller" cx={p.x - 4} cy={p.y + 17} r="2.6" />
          <circle class="tf-roller" cx={p.x + 4} cy={p.y + 17} r="2.6" />
          <line x1={p.x - 12} y1={p.y + 20} x2={p.x + 12} y2={p.y + 20} />
        {:else}
          {#each [-9, -3, 3, 9] as h}
            <line class="tf-hatch" x1={p.x + h} y1={p.y + 14} x2={p.x + h - 4} y2={p.y + 19} />
          {/each}
        {/if}
      {/each}
    </g>

    <!-- the unit moving load -->
    <g class="tf-load" aria-hidden="true" transform="translate({loadPoint.x} {loadPoint.y})">
      <line x1="0" y1="-30" x2="0" y2="-9" />
      <path d="M-4.5 -15 L0 -6 L4.5 -15 z" />
    </g>
    </g>

  </svg>

  {#if compact}
    <figcaption class="tf-caption">{captionKey ? t(captionKey) : ''}</figcaption>
  {:else}
    <figcaption class="hf-row">
      <span class="hf-tag">{t('landing.trussTag')}</span>
      <span class="hf-item"><i class="hf-sw" style="background: var(--tf-tension)"></i>{t('landing.trussTension')} <b>{t('landing.trussTMax')} {fmtP.format(forceRange.max)} P</b></span>
      <span class="hf-item"><i class="hf-sw" style="background: var(--tf-compression)"></i>{t('landing.trussCompression')} <b>{t('landing.trussCMax')} {fmtP.format(-forceRange.min)} P</b></span>
    </figcaption>
  {/if}
</figure>
