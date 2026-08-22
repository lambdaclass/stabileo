<script lang="ts">
  /**
   * Where you are in the concrete workflow, what you can do next, and what is missing.
   *
   * ── The problem this exists for ────────────────────────────────────
   *
   * The RC tab used to open on six command buttons in a wrapping row, three collapsed disclosures
   * above them, and a monospace count strip between. Every one of those is reachable; none of them
   * says what ORDER they go in or what a greyed-out command is waiting for. A user who does not
   * know the internal architecture had to infer the pipeline from the fact that some buttons were
   * disabled — and a disabled button with a tooltip is a riddle, not an instruction.
   *
   * This is the answer to "where am I", "what can I do now", "what is missing" and "how do I get
   * to the next step", stated once, at the top, in the order the work actually happens.
   *
   * ── Why it is derived and not stored ───────────────────────────────
   *
   * Every stage reads the same state the commands themselves gate on. There is no separate
   * "current step" variable to fall out of sync: if `cmd-code-check` is enabled, CHECK is
   * reachable, because both ask `verificationStore` the same question. A stage cannot claim the
   * work is done when the command that does it is still lit.
   *
   * Nothing here performs work. Clicking a stage NAVIGATES — it opens the disclosure that owns
   * that step and scrolls to it — because a stage strip that also ran things would be a second
   * command surface competing with the first.
   */
  import { t } from '../../../lib/i18n';
  import { modelStore, resultsStore, verificationStore } from '../../../lib/store';
  import { detailingStore } from '../../../lib/store/detailing.svelte';

  interface Props {
    /** Open the disclosure a stage belongs to. The tab owns them; this only asks. */
    onGoTo: (target: 'model' | 'design' | 'floors' | 'detailing' | 'documents') => void;
  }
  const { onGoTo }: Props = $props();

  type State = 'done' | 'current' | 'blocked';

  const hasModel = $derived(modelStore.nodes.size > 0);
  const solved = $derived(resultsStore.results3D !== null || resultsStore.results !== null);
  const hasDemands = $derived(verificationStore.demandRevision > 0);
  const checked = $derived(verificationStore.baselineRevision > 0);
  const designed = $derived(verificationStore.providedSummary.total > 0);
  const detailed = $derived(detailingStore.assemblies.length > 0);

  /**
   * The pipeline, in the order it runs.
   *
   * `todo` is the SENTENCE a user reads while the stage is unfinished — not the name of a flag.
   * It is the same fact the disabled command's tooltip carries, said once and in the place where
   * someone is looking for it.
   */
  const STAGES = $derived([
    {
      id: 'model' as const,
      label: t('design.stage.model'),
      done: hasModel && solved,
      todo: hasModel ? t('design.stage.needSolve') : t('design.stage.needModel'),
      go: 'model' as const,
    },
    {
      id: 'demands' as const,
      label: t('design.stage.demands'),
      done: hasDemands,
      todo: t('design.stage.needSolve'),
      go: 'design' as const,
    },
    {
      id: 'check' as const,
      label: t('design.stage.check'),
      done: checked,
      todo: t('design.stage.needDemands'),
      go: 'design' as const,
    },
    {
      id: 'design' as const,
      label: t('design.stage.design'),
      done: designed,
      todo: t('design.stage.needDemands'),
      go: 'design' as const,
    },
    {
      id: 'detailing' as const,
      label: t('design.stage.detailing'),
      done: detailed,
      todo: t('design.stage.needDesign'),
      go: 'detailing' as const,
    },
    {
      id: 'documents' as const,
      label: t('design.stage.documents'),
      done: detailed && detailingStore.document !== null,
      todo: t('design.stage.needDetailing'),
      go: 'documents' as const,
    },
  ]);

  /**
   * "You are here" is the first stage that has not produced its output yet.
   *
   * Deliberately NOT "the first reachable one". The two differ exactly when the current step is
   * itself waiting on something — a model loaded but not solved — and in that case the strip must
   * still point at MODEL and say what it needs, rather than pointing further down the pipeline at
   * a step that cannot be started either. It is where you ARE, not where you could click.
   *
   * Computed rather than stored, so stepping back to an earlier disclosure does not move the
   * marker: it tracks the PROJECT's progress, not the panel's scroll position.
   */
  const currentId = $derived(STAGES.find((s) => !s.done)?.id ?? null);

  function stateOf(s: { done: boolean; id: string }): State {
    if (s.done) return 'done';
    if (s.id === currentId) return 'current';
    // Everything after the current step. Not an error — a step you have not reached.
    return 'blocked';
  }

  /**
   * The one-line instruction under the strip.
   *
   * Always the CURRENT stage's own `todo`, because that is the next thing a person has to do,
   * whether the step is blocked by a prerequisite or simply not started. An empty hint would put
   * the burden back on reading which buttons are grey.
   */
  const nextHint = $derived.by(() => {
    const cur = STAGES.find((s) => s.id === currentId);
    return cur ? cur.todo : t('design.stage.allDone');
  });
</script>

<nav class="stages" data-testid="workflow-stages" aria-label={t('design.stage.title')}>
  <ol>
    {#each STAGES as s, i (s.id)}
      {@const state = stateOf(s)}
      <li class="stage stage-{state}" data-testid={`stage-${s.id}`} data-state={state}>
        <button
          type="button"
          onclick={() => onGoTo(s.go)}
          aria-current={s.id === currentId ? 'step' : undefined}
          title={state === 'done' ? s.label : s.todo}
        >
          <!--
            The number carries the ORDER, the glyph carries the STATE, and the word carries the
            name. Three channels, so none of it depends on colour alone — the same rule the
            design badges follow.
          -->
          <span class="mark" aria-hidden="true">{state === 'done' ? '✓' : i + 1}</span>
          <span class="name">{s.label}</span>
          <span class="sr-only">
            {state === 'done' ? t('design.stage.srDone')
              : state === 'current' ? t('design.stage.srCurrent')
              : `${t('design.stage.srBlocked')} — ${s.todo}`}
          </span>
        </button>
      </li>
    {/each}
  </ol>
  {#if nextHint}
    <p class="hint" data-testid="workflow-next">{nextHint}</p>
  {/if}
</nav>

<style>
  /*
    A strip, not a card: it sits above the disclosures and must cost as little height as it can
    at 1280×720, where the panel is already tight.
  */
  .stages {
    flex: 0 0 auto;
    padding: 0.4rem 0.75rem 0.35rem;
    border-bottom: 1px solid var(--st-hair);
    background: var(--st-surface);
  }
  ol {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .stage { display: flex; align-items: center; }
  /* The chevron between steps is what makes this read as a sequence rather than as tabs. */
  .stage:not(:last-child)::after {
    content: '›';
    color: var(--st-text-3);
    padding: 0 0.1rem;
    font-size: 0.8rem;
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    padding: 0.15rem 0.35rem;
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--st-text-2);
    font-size: 0.72rem;
    cursor: pointer;
    white-space: nowrap;
  }
  button:hover { background: var(--st-surface-3); color: var(--st-text); }
  button:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }

  .mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.05rem;
    height: 1.05rem;
    border-radius: 50%;
    border: 1px solid currentColor;
    font-size: 0.62rem;
    font-weight: 700;
    flex: 0 0 auto;
  }

  .stage-done button { color: var(--st-ok); }
  .stage-done .mark { border-color: var(--st-ok); }
  .stage-current button {
    color: var(--st-text);
    border-color: var(--st-interactive);
    background: var(--st-surface-3);
    font-weight: 600;
  }
  .stage-current .mark { border-color: var(--st-interactive); color: var(--st-interactive); }
  /* Blocked is dimmer AND keeps its number: it is a step you have not reached, not an error. */
  .stage-blocked button { color: var(--st-text-3); }

  .hint {
    margin: 0.3rem 0 0;
    font-size: 0.7rem;
    color: var(--st-text-2);
  }

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
