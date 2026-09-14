<script lang="ts">
  /**
   * What the last reinforcement edit invalidated, and the command that answers it.
   *
   * ── Why there is anything to say ───────────────────────────────────
   *
   * `rc-selection.ts` states the rule: an edit is retroactive iff every representation of the
   * edited member is rebuilt from the model after it. Objective 10 wired the half that was
   * missing — the coordinated assemblies now follow a rebar edit — and the moment they do,
   * something has to say WHICH levels stopped being current. An assembly that silently drops
   * from CONSTRUCTIBLE back to VERIFIED is a state change with no author.
   *
   * ── Why it names the members and the levels ────────────────────────
   *
   * An edit to one beam invalidates the level it is on and no other. A notice that said
   * "the detailing is out of date" would be as useless as the nothing that used to be here: it
   * would be true of a one-beam edit and of a fifty-beam one, and a reader could not tell
   * whether to regenerate now or keep editing.
   *
   * ── Why it clears itself ───────────────────────────────────────────
   *
   * `setAssemblies` drops `lastEdit`, so a regeneration ANSWERS the notice. A dismiss button
   * would let a reader silence a statement about their project without changing the project,
   * which is the one thing this notice must not allow.
   */
  import { t, tp } from '../../../lib/i18n';
  import { detailingStore } from '../../../lib/store/detailing.svelte';

  const edit = $derived(detailingStore.lastEdit);
  /** Nothing invalidated is nothing to say: a member on no assembly is a real, quiet outcome. */
  const show = $derived((edit?.invalidated.length ?? 0) > 0);
</script>

{#if show && edit}
  <!--
    `role="status"` and not `alert`: it is a fact about the levels below it, not an error, and
    it is announced once when it appears rather than interrupting.
  -->
  <p class="edited" data-testid="detailing-edited" role="status">
    <span class="edited-what" data-testid="detailing-edited-what">
      {tp('detailing.edit.invalidated', {
        members: edit.written.length,
        ids: edit.written.slice(0, 6).join(', '),
        levels: edit.invalidated.length,
      })}
    </span>
    <button
      type="button"
      class="regen"
      data-testid="detailing-edited-regenerate"
      disabled={!detailingStore.readiness.ready || detailingStore.generating}
      onclick={() => detailingStore.generate()}
    >
      {detailingStore.generating ? t('detailing.cmd.generating') : t('detailing.cmd.generate')}
    </button>
  </p>
{/if}

<style>
  /*
    Amber tint and a rule, never an opaque fill — the form every state on this surface uses,
    and the contrast reason `--st-warn-bg` was added for.
  */
  .edited {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.4rem;
    margin: 0.35rem 0 0;
    padding: 0.3rem 0.5rem;
    border-left: 3px solid var(--st-warn);
    border-radius: 4px;
    background: var(--st-warn-bg);
    font-size: 0.72rem;
    line-height: 1.35;
  }
  .edited-what { flex: 1; min-width: 12rem; color: var(--st-text); }
  .regen {
    padding: 0.12rem 0.45rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    background: var(--st-surface-2);
    color: var(--st-text-2);
    font: inherit;
    font-size: 0.7rem;
    cursor: pointer;
  }
  .regen:hover:not(:disabled) { background: var(--st-surface-3); color: var(--st-text); }
  .regen:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
  .regen:disabled { opacity: 0.55; cursor: not-allowed; }
</style>
