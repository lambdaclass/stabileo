<script lang="ts">
  /**
   * The concrete flow's stage timeline.
   *
   * ── Why this is not `WorkflowStages.svelte` ────────────────────────
   *
   * That one is shared: `ProRibbon.svelte` renders it for the metallic flow, and its six stages
   * are that flow's. Trying to serve both from one component is what produced the defect this
   * replaces — six stages drawn, five disclosures to land on, and a third list of five in the
   * navigation callback, with `demands` and `check` having no destination, `floors` having no
   * stage, and `model` and `design` both falling through to the same scroll.
   *
   * So the concrete flow gets its own, `WorkflowStages` is untouched, and the vocabulary lives
   * in `lib/flow/rc-stages.ts` where it can be asserted without a browser.
   *
   * ── Sticky, and what that required ─────────────────────────────────
   *
   * The strip used to scroll away with the column, which is the same as not having it: the
   * question it answers ("where am I") is asked while reading something further down. It is
   * `position: sticky` at the top of the scrolling column now. The column is the scroll
   * container — `.rc-workflow` is `overflow-y: auto` — so sticky resolves against it and needs
   * no viewport maths.
   *
   * ── Navigation is bidirectional, and there is still one state ──────
   *
   * Clicking a stage opens its disclosure. Opening a disclosure by hand marks its stage. Those
   * are not two states: the tab owns the open/closed booleans, passes down which stage is open,
   * and this component renders it. Nothing here remembers anything.
   *
   * The marker and the open section are DIFFERENT THINGS and both are shown. `aria-current` and
   * the ring mark where the PROJECT is; `data-open` marks what you are reading. Collapsing them
   * would mean scrolling to a finished stage moved the "you are here" marker onto it.
   *
   * ── It navigates; it never acts ────────────────────────────────────
   *
   * The commands stay the single place work is started from, so this cannot become a second,
   * competing command surface.
   */
  import { t } from '../../../lib/i18n';
  import {
    currentRcStage, rcStageTodoKey,
    type RcModelReadiness, type RcStage, type RcStageId,
  } from '../../../lib/flow/rc-stages';

  interface Props {
    /**
     * The resolved stages.
     *
     * Passed in rather than derived here, and that is the point: the tab derives them ONCE and
     * gives the same array to this strip and to the five disclosures below it. A component
     * that derived its own would be the second stage-state the scope forbids, and the two
     * would eventually disagree about whether a step is finished.
     */
    stages: readonly RcStage[];
    /** How ready the model is, for the sentence MODELADO owes the reader. */
    readiness: RcModelReadiness;
    /** Open the disclosure a stage owns. The tab owns them; this only asks. */
    onGoTo: (target: RcStageId) => void;
    /** Which disclosure is open right now, for the reading marker. */
    openStage: RcStageId | null;
  }
  const { stages, readiness, onGoTo, openStage }: Props = $props();

  const current = $derived(currentRcStage(stages));

  /**
   * The one-line instruction under the strip.
   *
   * The current stage's own sentence, whether it is blocked by a prerequisite or simply not
   * started — an empty hint would put the burden back on reading which buttons are grey. When
   * every required stage is finished, it says so rather than going quiet.
   */
  const hint = $derived(
    current ? t(rcStageTodoKey(current, readiness)) : t('design.stage.allDone'));

  /**
   * What MODELADO is waiting for, in its own words.
   *
   * §1 requires the stage to explain the model's readiness rather than only whether a model
   * exists, and the four states have different remedies: draw one, solve it, solve it again,
   * or nothing. Shown next to the hint only while it is the thing standing in the way.
   */
  const readinessKey: Record<RcModelReadiness, string> = {
    empty: 'design.stage.readiness.empty',
    unsolved: 'design.stage.readiness.unsolved',
    stale: 'design.stage.readiness.stale',
    ready: 'design.stage.readiness.ready',
  };

  /** The title of the section being read, under the strip. Absent when nothing is open. */
  const openLabel = $derived(stages.find((s) => s.id === openStage)?.labelKey ?? null);

  const SR: Record<string, string> = {
    complete: 'design.stage.srComplete',
    current: 'design.stage.srCurrent',
    pending: 'design.stage.srPending',
    blocked: 'design.stage.srBlocked',
    optional: 'design.stage.srOptional',
  };
</script>

<nav class="timeline" data-testid="rc-stage-timeline" aria-label={t('design.stage.title')}>
  <ol>
    {#each stages as s, i (s.id)}
      <li
        class="stage"
        data-testid={`rc-stage-${s.id}`}
        data-state={s.state}
        data-open={s.id === openStage ? 'true' : undefined}
      >
        <button
          type="button"
          onclick={() => onGoTo(s.id)}
          aria-current={s.id === current?.id ? 'step' : undefined}
          title={s.state === 'complete' ? t(s.labelKey) : t(rcStageTodoKey(s, readiness))}
        >
          <!--
            The number is the stage's position and nothing else. It used to disagree with the
            sections below it, which ran 0, 1, 4, 5, 6 for five things.
          -->
          <span class="mark" aria-hidden="true">{s.state === 'complete' ? '✓' : i + 1}</span>
          <span class="label">{t(s.labelKey)}</span>
          <span class="sr-only">{t(SR[s.state])}</span>
        </button>
      </li>
    {/each}
  </ol>

  <p class="hint" data-testid="rc-stage-hint">
    {#if openLabel}
      <!--
        What you are READING, next to what you have to DO. They are different questions and the
        strip answers both — the marker says where the project is, this says where you are.
      -->
      <span class="reading" data-testid="rc-stage-open">{t(openLabel)}</span>
    {/if}
    <span data-testid="rc-stage-next">{hint}</span>
    {#if current?.id === 'model' && readiness !== 'ready'}
      <!--
        The chip carries the readiness as DATA for the audit and as colour for the eye; the
        sentence itself is already in the hint above, chosen by `rcStageTodoKey`. Rendering the
        word twice would be the panel repeating itself.
      -->
      <span class="readiness" data-testid="rc-stage-readiness" data-readiness={readiness}
        >{t(readinessKey[readiness])}</span>
    {/if}
  </p>
</nav>

<style>
  /*
   * Sticky against the scrolling column, not the viewport. `.rc-workflow` is the
   * `overflow-y: auto` container, so `top: 0` resolves there and the strip stays put while its
   * siblings scroll under it.
   *
   * The background is opaque on purpose: a translucent one lets the content it is covering read
   * through, and at 1024×700 there is always content under it.
   */
  .timeline {
    position: sticky;
    top: 0;
    z-index: 3;
    background: var(--st-surface);
    border-bottom: 1px solid var(--st-hair);
    padding: 0.35rem 0.5rem 0.3rem;
    font-family: var(--st-sans);
  }

  ol {
    display: flex;
    /*
     * NO WRAP. The shared strip wraps its six stages into two rows and leaves the last one
     * alone underneath, which is the defect the QA guide tells reviewers not to report. Five
     * short labels fit on one line at 1024 px; if they ever do not, the row scrolls sideways
     * rather than growing a second line that would double the strip's height against a sticky
     * budget.
     */
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
    align-items: stretch;
    gap: 0.1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  ol::-webkit-scrollbar { display: none; }

  .stage { display: flex; align-items: center; flex: 0 1 auto; min-width: 0; }
  /* The separator, drawn between stages rather than after the last one. */
  .stage + .stage::before {
    content: '';
    width: 0.6rem;
    height: 1px;
    background: var(--st-hair-strong);
    flex: 0 0 auto;
  }

  button {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
    padding: 0.2rem 0.35rem;
    border: 0;
    border-radius: 4px;
    /*
     * A real surface, not `none`.
     *
     * The first version was `background: none; border: 0`, which C1 of
     * `pro-panel-consistency.spec.ts` reports — correctly — as a control left to the browser to
     * paint. The sweep cannot tell a deliberately flat button from an untouched UA default, and
     * the rule it enforces is the one that keeps the panel reading as one product: every control
     * carries a surface of ours or a border of ours. Adding an invisible border to satisfy the
     * check would have been gaming it.
     */
    background: var(--st-surface-2);
    cursor: pointer;
    font: inherit;
    font-size: 0.75rem;
    color: var(--st-text-2);
    white-space: nowrap;
  }
  button:hover { background: var(--st-surface-3); }
  /*
   * A blocked stage keeps the surface and loses only its text weight. Making it transparent was
   * the first attempt and C1 rejects it for the same reason it rejected the base state: a
   * control with neither a surface nor a border of ours reads as unpainted, and `box-shadow` is
   * not a border as far as that sweep — or a user — is concerned.
   */
  button:focus-visible { outline: 2px solid var(--st-value); outline-offset: -1px; }

  .mark {
    display: grid;
    place-items: center;
    width: 1.1rem;
    height: 1.1rem;
    flex: 0 0 auto;
    border: 1px solid var(--st-hair-strong);
    border-radius: 50%;
    font-size: 0.65rem;
    line-height: 1;
  }

  .label { overflow: hidden; text-overflow: ellipsis; }

  /*
   * The five states.
   *
   * `complete` is green because the user's action happened, NOT because anything verified —
   * the outcome badges own that claim, and the strip is not entitled to it.
   */
  .stage[data-state='complete'] button { color: var(--st-ok); }
  .stage[data-state='complete'] .mark { border-color: var(--st-ok); color: var(--st-ok); }

  .stage[data-state='current'] button { color: var(--st-text); font-weight: 600; }
  .stage[data-state='current'] .mark {
    border-color: var(--st-interactive);
    color: var(--st-interactive);
  }

  /* Not yet — and not an error. Kept at normal secondary text, not dimmed further. */
  .stage[data-state='pending'] button { color: var(--st-text-2); }

  /*
   * Nothing can start: there is no model. Dimmer than pending because the remedy is different,
   * and `--st-text-3` is the token reserved for exactly this — inactive, non-interactive text.
   */
  .stage[data-state='blocked'] button { color: var(--st-text-3); }

  .stage[data-state='optional'] button { color: var(--st-text-2); font-style: italic; }
  .stage[data-state='optional'] .mark { border-style: dashed; }

  /*
   * What you are READING. A ring rather than a colour, so it can coexist with any of the five
   * state colours instead of overwriting one of them.
   */
  .stage[data-open='true'] button {
    background: var(--st-surface-3);
    box-shadow: inset 0 0 0 1px var(--st-hair-strong);
  }

  .hint {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 0.6rem;
    margin: 0.25rem 0 0;
    font-size: 0.7rem;
    line-height: 1.35;
    color: var(--st-text-2);
  }
  .reading { color: var(--st-text); font-weight: 600; }
  .readiness { color: var(--st-warn); }
  .readiness[data-readiness='empty'] { color: var(--st-text-3); }

  .sr-only {
    position: absolute;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }
</style>
