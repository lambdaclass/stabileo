<script lang="ts">
  import { tourStore } from '../lib/store/tour.svelte';
  import { t } from '../lib/i18n';
  import { onMount, onDestroy } from 'svelte';

  const PADDING_DEFAULT = 8;
  const CARD_GAP = 14;
  const CARD_W = 380;
  const CARD_W_MOBILE = 320;

  let cardX = $state(0);
  let cardY = $state(0);
  let cardH = $state(220); // measured card height, default estimate
  let vw = $state(window.innerWidth);
  let vh = $state(window.innerHeight);
  let rafId: number | null = null;
  let cardEl: HTMLDivElement | undefined = $state();
  let autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;
  let autoAdvanceArmed = $state(false); // true when waitFor was false on step entry

  function isMobile() { return vw < 768; }

  // --- Position polling ---
  function tick() {
    if (!tourStore.isActive) return;
    tourStore.updateTargetRect();
    vw = window.innerWidth;
    vh = window.innerHeight;
    // Measure real card height
    if (cardEl) {
      const h = cardEl.getBoundingClientRect().height;
      if (h > 0) cardH = h;
    }
    computeCardPosition();
    rafId = requestAnimationFrame(tick);
  }

  onMount(() => {
    if (tourStore.isActive) rafId = requestAnimationFrame(tick);
  });

  onDestroy(() => {
    if (rafId) cancelAnimationFrame(rafId);
    if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
  });

  // Start/stop polling when tour activates/deactivates
  $effect(() => {
    if (tourStore.isActive) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(tick);
      document.body.classList.add('tour-active');
    } else {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      document.body.classList.remove('tour-active');
    }
  });

  // Recompute card when step changes + arm autoAdvance
  $effect(() => {
    if (tourStore.isActive && tourStore.currentStep) {
      cardH = 220; // reset estimate for new step
      // Arm autoAdvance only if waitFor is currently NOT satisfied
      // This way, if the user navigates back to a step whose condition is already met,
      // the tour won't auto-skip it (they can read it and click Next manually).
      const step = tourStore.currentStep;
      autoAdvanceArmed = !!(step.autoAdvance && step.waitFor && !step.waitFor());
      if (autoAdvanceTimer) { clearTimeout(autoAdvanceTimer); autoAdvanceTimer = null; }
      requestAnimationFrame(() => {
        tourStore.updateTargetRect();
        computeCardPosition();
      });
    }
  });

  // Auto-advance effect: only triggers when armed AND waitFor becomes true
  $effect(() => {
    const step = tourStore.currentStep;
    const stepIndex = tourStore.currentStepIndex;
    if (tourStore.isActive && autoAdvanceArmed && step?.autoAdvance && step?.waitFor?.()) {
      if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
      autoAdvanceTimer = setTimeout(() => {
        // Only advance if still on the same step (prevents double-advance)
        if (tourStore.isActive && !tourStore.isLastStep && tourStore.currentStepIndex === stepIndex) {
          tourStore.next();
        }
        autoAdvanceTimer = null;
      }, 800);
    }
  });

  function computeCardPosition() {
    const step = tourStore.currentStep;
    if (!step) return;

    // Explicit card position override (clamped to viewport)
    if (step.cardPosition) {
      const cw = isMobile() ? CARD_W_MOBILE : (step.cardWidth ?? CARD_W);
      cardX = clampX(step.cardPosition.x, cw);
      cardY = clampY(step.cardPosition.y);
      return;
    }

    const rect = tourStore.targetRect;
    const mobile = isMobile();
    const cw = mobile ? CARD_W_MOBILE : (step.cardWidth ?? CARD_W);

    // Center-screen steps or no target found
    if (!rect || step.position === 'center' || step.target === 'none') {
      cardX = (vw - cw) / 2;
      cardY = Math.max(10, (vh - cardH) / 2 - 40);
      return;
    }

    // Mobile: card always at bottom (CSS overrides via !important)
    if (mobile) {
      cardX = (vw - cw) / 2;
      cardY = vh - cardH - 10;
      return;
    }

    const pad = step.highlightPadding ?? PADDING_DEFAULT;
    const hx = rect.left - pad;
    const hy = rect.top - pad;
    const hw = rect.width + pad * 2;
    const hh = rect.height + pad * 2;
    const hCx = hx + hw / 2;

    const pos = step.position === 'auto' ? autoPick(rect, cw) : step.position;

    switch (pos) {
      case 'bottom':
        cardX = clampX(hCx - cw / 2, cw);
        cardY = clampY(hy + hh + CARD_GAP);
        break;
      case 'top':
        cardX = clampX(hCx - cw / 2, cw);
        cardY = clampY(hy - CARD_GAP - cardH);
        break;
      case 'right':
        cardX = clampX(hx + hw + CARD_GAP, cw);
        cardY = clampY(hy);
        break;
      case 'left':
        cardX = clampX(hx - cw - CARD_GAP, cw);
        cardY = clampY(hy);
        break;
      default:
        cardX = (vw - cw) / 2;
        cardY = Math.max(10, (vh - cardH) / 2 - 40);
    }
  }

  function clampX(x: number, cw: number) { return Math.max(10, Math.min(vw - cw - 10, x)); }
  function clampY(y: number) { return Math.max(10, Math.min(vh - cardH - 10, y)); }

  function autoPick(rect: DOMRect, cw: number): 'top' | 'bottom' | 'left' | 'right' {
    if (vh - rect.bottom > cardH + 30) return 'bottom';
    if (rect.top > cardH + 30) return 'top';
    if (vw - rect.right > cw + 20) return 'right';
    if (rect.left > cw + 20) return 'left';
    return 'bottom';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!tourStore.isActive) return;
    e.stopPropagation(); // prevent shortcuts (Enter→calcular) from firing during tour
    if (e.key === 'Escape') { tourStore.end(); e.preventDefault(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') {
      const step = tourStore.currentStep;
      // On autoAdvance steps, don't manually advance — let the waitFor + autoAdvance handle it.
      // Enter should pass through to trigger the underlying action (e.g. calcular).
      if (step?.autoAdvance && e.key === 'Enter') return;
      if (tourStore.isLastStep) tourStore.end();
      else if (tourStore.canAdvance) tourStore.next();
      e.preventDefault();
    }
    else if (e.key === 'ArrowLeft') { tourStore.prev(); e.preventDefault(); }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if tourStore.isActive && tourStore.currentStep}
  {@const step = tourStore.currentStep}
  {@const rect = tourStore.targetRect}
  {@const pad = step.highlightPadding ?? PADDING_DEFAULT}
  {@const cw = isMobile() ? CARD_W_MOBILE : (step.cardWidth ?? CARD_W)}
  {@const opacity = step.overlayOpacity ?? 0.6}

  <div class="tour-overlay">
    <!-- Dark overlay with spotlight hole (SVG mask) -->
    <svg class="tour-svg" viewBox="0 0 {vw} {vh}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <mask id="tour-spotlight-mask">
          <rect x="0" y="0" width={vw} height={vh} fill="white" />
          {#if rect}
            <rect
              x={rect.left - pad}
              y={rect.top - pad}
              width={rect.width + pad * 2}
              height={rect.height + pad * 2}
              rx="8" ry="8"
              fill="black"
            />
          {/if}
        </mask>
      </defs>

      <!-- Darkened backdrop -->
      <rect
        x="0" y="0" width={vw} height={vh}
        fill="rgba(0,0,0,{opacity})"
        mask="url(#tour-spotlight-mask)"
      />

      <!-- Highlight ring -->
      {#if rect}
        <rect
          x={rect.left - pad - 1.5}
          y={rect.top - pad - 1.5}
          width={rect.width + pad * 2 + 3}
          height={rect.height + pad * 2 + 3}
          rx="9" ry="9"
          fill="none"
          stroke="#4ecdc4"
          stroke-width="2"
          opacity="0.7"
        />
      {/if}
    </svg>

    <!-- Click blocker when interaction is disabled -->
    {#if !step.allowInteraction}
      <div class="tour-blocker"></div>
    {/if}

    <!-- Step card -->
    <div
      class="tour-card"
      class:center={step.target === 'none' || step.position === 'center'}
      style="left:{cardX}px; top:{cardY}px; width:{cw}px;{isMobile() && step.mobileCardMaxHeight ? `max-height:${step.mobileCardMaxHeight}` : ''}{isMobile() && step.mobileCardBottom ? `;bottom:${step.mobileCardBottom} !important;top:auto !important` : ''}"
      bind:this={cardEl}
    >
      <!-- Progress bar -->
      <div class="tour-progress">
        <div class="tour-progress-fill" style="width:{tourStore.progress * 100}%"></div>
      </div>

      <div class="tour-body">
        <span class="tour-counter">{tourStore.currentStepIndex + 1} / {tourStore.totalSteps}</span>
        <h3 class="tour-title">{step.title}</h3>
        <div class="tour-desc">{@html step.description}</div>
      </div>

      <div class="tour-footer">
        {#if !tourStore.isLastStep}
          <button class="tour-skip" onclick={() => tourStore.end()}>
            {t('tour.skip')}
          </button>
        {/if}
        <div class="tour-nav">
          {#if !tourStore.isFirstStep}
            <button class="tour-prev" onclick={() => tourStore.prev()}>
              {t('tour.prev')}
            </button>
          {/if}
          {#if tourStore.isLastStep}
            <button class="tour-finish" onclick={() => tourStore.end()}>
              {window !== window.parent ? t('tour.tryFullApp') : t('tour.finish')}
            </button>
          {:else if step.waitFor && !tourStore.canAdvance && step.actionButton}
            <!-- Action button replaces "Esperando..." when available -->
            <button
              class="tour-action"
              onclick={() => {
                step.actionButton!.action();
                if (step.actionButton!.advanceAfter !== false) {
                  // Small delay so the action can take effect (e.g. model loads)
                  setTimeout(() => tourStore.next(), 100);
                }
              }}
            >
              {step.actionButton.label}
            </button>
          {:else}
            <!-- Multi-action buttons shown before "Siguiente →" -->
            {#if step.multiAction}
              {#each step.multiAction as ma}
                <button
                  class="tour-action"
                  onclick={() => {
                    ma.action();
                    if (ma.advanceAfter !== false) {
                      setTimeout(() => tourStore.next(), 100);
                    }
                  }}
                >
                  {ma.label}
                </button>
              {/each}
            {/if}
            <button
              class="tour-next"
              onclick={() => tourStore.next()}
              disabled={step.waitFor ? !tourStore.canAdvance : false}
            >
              {step.waitFor && !tourStore.canAdvance ? t('tour.waiting') : t('tour.next')}
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .tour-overlay {
    position: fixed;
    inset: 0;
    z-index: 11000;
    pointer-events: none;
  }

  .tour-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  /* SVG rects transition for smooth spotlight movement */
  .tour-svg rect {
    transition: x 0.35s ease, y 0.35s ease, width 0.35s ease, height 0.35s ease;
  }

  .tour-blocker {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: auto;
  }

  /* ─── Card ─── */
  .tour-card {
    position: absolute;
    background: #16213e;
    border: 1px solid #1a4a7a;
    border-radius: 12px;
    box-shadow:
      0 8px 40px rgba(0, 0, 0, 0.6),
      0 0 0 1px rgba(78, 205, 196, 0.1),
      0 0 80px rgba(78, 205, 196, 0.04);
    overflow: hidden;
    transition: left 0.35s ease, top 0.35s ease;
    z-index: 1;
    pointer-events: auto;
    animation: tour-card-in 0.3s ease;
  }

  @keyframes tour-card-in {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .tour-progress {
    height: 3px;
    background: #0f3460;
  }

  .tour-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #4ecdc4, #44b8b0);
    transition: width 0.35s ease;
    border-radius: 0 2px 2px 0;
  }

  .tour-body {
    padding: 1.25rem 1.5rem 0.75rem;
  }

  .tour-counter {
    display: inline-block;
    font-size: 0.68rem;
    color: #556;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 0.4rem;
    font-weight: 600;
  }

  .tour-title {
    font-size: 1.1rem;
    font-weight: 700;
    color: #4ecdc4;
    margin: 0 0 0.6rem;
    line-height: 1.3;
  }

  .tour-desc {
    font-size: 0.84rem;
    color: #bbb;
    line-height: 1.6;
  }

  .tour-desc :global(strong) { color: #eee; }
  .tour-desc :global(em) { color: #4ecdc4; font-style: normal; font-weight: 600; }

  /* ─── Footer ─── */
  .tour-footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 0.4rem;
    padding: 0.6rem 1rem 1rem;
    border-top: 1px solid #0f3460;
  }

  .tour-skip {
    background: none;
    border: none;
    color: #556;
    font-size: 0.75rem;
    cursor: pointer;
    padding: 0.3rem 0;
    transition: color 0.15s;
  }
  .tour-skip:hover { color: #aaa; }

  .tour-nav {
    display: flex;
    gap: 0.5rem;
    margin-left: auto;
  }

  .tour-prev {
    background: #0f3460;
    border: 1px solid #1a4a7a;
    color: #aaa;
    padding: 0.4rem 0.9rem;
    border-radius: 6px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  .tour-prev:hover { background: #1a4a7a; color: #eee; }

  .tour-next {
    background: #e94560;
    border: 1px solid transparent;
    color: white;
    padding: 0.4rem 1.1rem;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .tour-next:hover:not(:disabled) { background: #ff6b6b; }
  .tour-next:disabled { opacity: 0.45; cursor: not-allowed; }

  .tour-finish {
    background: #4ecdc4;
    border: 1px solid transparent;
    color: #0a1628;
    padding: 0.4rem 1.1rem;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s;
  }
  .tour-finish:hover { background: #6ee0d8; }

  .tour-action {
    background: #4ecdc4;
    border: 1px solid transparent;
    color: #0a1628;
    padding: 0.4rem 1.1rem;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s;
  }
  .tour-action:hover { background: #6ee0d8; }

  /* ─── Mobile ─── */
  @media (max-width: 767px) {
    .tour-card {
      left: 8px !important;
      right: 8px;
      bottom: 8px;
      top: auto !important;
      width: calc(100vw - 16px) !important;
      max-height: 55vh;
      overflow-y: auto;
    }

    .tour-body { padding: 0.9rem 1rem 0.5rem; }
    .tour-footer { padding: 0.5rem 1rem 0.75rem; }
    .tour-title { font-size: 1rem; }
    .tour-desc { font-size: 0.8rem; }
  }
</style>
