<script lang="ts">
  /**
   * What the current selection IS, whatever kind of thing it is.
   *
   * ── Why one component for four cases ───────────────────────────
   *
   * A click in this workspace can land on four different things — a bar, a conflict marker, a
   * member's concrete, or nothing — and the panel that answers has to say something useful for
   * each without the four drifting into four different layouts. Keeping them in one place is
   * what makes "every selection reports its member and its state" a property rather than a
   * coincidence: the status block below the branch runs for all of them.
   *
   * The order of the branches is the order of specificity. A bar names itself; a conflict names
   * a pair of bars; a member names only itself. Asking the most specific first is what stops a
   * clicked marker being reported as "member 88" and nothing else.
   */
  import { t, tp } from '../../../lib/i18n';
  import { rebarWorkspace } from '../../../lib/store/rebar-workspace.svelte';
  import ConflictInspector from './ConflictInspector.svelte';
  import type {
    SceneBar, SceneConflictMarker, SceneSolid,
  } from '../../../lib/engine/detailing/scene-model';
  import type { ElementStatusEntry } from '../../../lib/engine/detailing/element-status';

  interface Props {
    bar: SceneBar | null | undefined;
    solid: SceneSolid | null | undefined;
    conflict: SceneConflictMarker | null;
    elementIds: number[];
    status: ElementStatusEntry | null | undefined;
    /** The design's own sentence for this member, already translated. */
    reason: string | null;
    /**
     * True when the selected member carries torsion this application does not evaluate.
     *
     * Beside the member's STATE rather than folded into it. The state is what the design
     * achieved and it is unchanged — a MODELLED member with unevaluated torsion is still
     * modelled — and the missing verification is a separate fact the reader has to be given
     * next to it. See `torsion-notice.ts`.
     */
    torsionUnevaluated?: boolean;
  }
  const {
    bar, solid, conflict, elementIds, status, reason, torsionUnevaluated = false,
  }: Props = $props();

  const fmt = (n: number, d = 2): string => n.toFixed(d);

  /** True while an isolation is active. Drives one button rather than two. */
  const isolating = $derived(rebarWorkspace.isolated.length > 0);
</script>

{#if bar}
  <dl>
    <dt>{t('detailing.scene.mark')}</dt>
    <dd data-testid="rebar-sel-mark">{bar.mark ?? t('detailing.scene.unmarked')}</dd>
    <dt>{t('detailing.scene.diameter')}</dt>
    <dd>Ø{bar.diameterMm}</dd>
    <dt>{t('detailing.scene.pieces.title')}</dt>
    <dd data-testid="rebar-sel-piece">{t(`detailing.scene.piece.${bar.piece}`)}</dd>
    <dt>{t('detailing.scene.cuttingLength')}</dt>
    <dd>{fmt(bar.cuttingLength)} m</dd>
    <dt>{t('detailing.scene.parentElement')}</dt>
    <dd data-testid="rebar-sel-parent">{bar.elementIds.join(', ') || '—'}</dd>
    <dt>{t('detailing.scene.layer')}</dt>
    <dd>{bar.layerId ?? '—'}</dd>
    <dt>{t('detailing.scene.assembly')}</dt>
    <dd>{bar.assemblyId}</dd>
    <!--
      Whether the engineer pinned this bar, and what that froze.

      The panel that pins is the detailing list; the place a pin's REACH is visible is here,
      because a bar continuous over a support owns the column as well as the beam and the 3-D
      view is where you can see it doing so. Read from `SceneBar.locked`, which the scene copies
      from the document — the same fact the list reads and the same one `runDetailing` and the
      repair loop are handed. Not a second flag kept by the viewer.

      Always rendered, both states. "Free" is a real answer and a row that appeared only when
      pinned would leave a reader unable to tell "not pinned" from "this panel does not say".
    -->
    <dt>{t('detailing.scene.pin')}</dt>
    <dd data-testid="rebar-sel-lock" data-lock={bar.locked ? 'pinned' : 'free'}>
      <span aria-hidden="true">{bar.locked ? '⬤' : '◯'}</span>
      {bar.locked ? t('detailing.bar.lock.pinned') : t('detailing.bar.lock.free')}
      {#if bar.locked}
        <span class="pin-reach" data-testid="rebar-sel-lock-reach">
          {tp(bar.elementIds.length > 1
            ? 'detailing.bar.lock.freezesMany' : 'detailing.bar.lock.freezesOne', {
            n: bar.elementIds.length,
            ids: bar.elementIds.join(', '),
          })}
        </span>
      {/if}
    </dd>
  </dl>
{:else if conflict}
  <!--
    A clicked marker answers about the CONFLICT, not about whichever bar happens to be behind
    it. Its own inspector, because the conflict is what the user asked about.
  -->
  <ConflictInspector {conflict} />
{:else if elementIds.length > 0}
  <dl>
    <dt>{t('detailing.scene.selectedElement')}</dt>
    <dd data-testid="rebar-sel-parent">{elementIds.join(', ')}</dd>
    {#if solid}
      <dt>{t('detailing.scene.families')}</dt>
      <dd>{t(`detailing.scene.kind.${solid.kind}`)}</dd>
    {/if}
  </dl>
{:else}
  <p class="hint">{t('detailing.scene.noSelection')}</p>
{/if}

{#if status}
  <p class="sel-status" data-testid="rebar-sel-status">
    {t(`detailing.scene.status.${status.status}`)}
    {#if status.limiting.length > 0}
      <span class="lim">({status.limiting.join(', ')})</span>
    {/if}
  </p>
  {#if reason}
    <p class="sel-reason" data-testid="rebar-sel-reason">
      {t('detailing.scene.reason')}: {reason}
    </p>
  {/if}
  {#if torsionUnevaluated}
    <p class="sel-torsion" data-testid="rebar-sel-torsion">
      <strong>{t('detailing.scene.torsionLabel')}</strong>
      {t('detailing.scene.torsionMember')}
    </p>
  {/if}
  <!--
    ONE button that changes, not two that replace each other.

    This was an `{#if}/{:else}` pair, and that is a keyboard dead end: clicking `rebar-isolate`
    flips the condition, Svelte DESTROYS the button that was just pressed and creates the other
    one, and the focused element leaves the DOM — so focus falls to `<body>` and the next Tab
    restarts at the top of the document. Measured: `focus=body` after isolating, and again after
    clearing.

    The same node now stays put and swaps its label, action and testid, so focus survives. The two
    testids are kept exactly as they were, because they name the STATE and existing specs read
    them that way.
  -->
  <div class="sel-actions">
    <button
      type="button"
      data-testid={isolating ? 'rebar-clear-isolation' : 'rebar-isolate'}
      onclick={() => (isolating
        ? rebarWorkspace.clearIsolation()
        : rebarWorkspace.isolate(rebarWorkspace.selection?.elementIds ?? []))}
    >
      {isolating ? t('detailing.scene.clearIsolation') : t('detailing.scene.isolate')}
    </button>
  </div>
{/if}

<style>
  dl {
    display: grid; grid-template-columns: auto 1fr; gap: 0.1rem 0.5rem;
    margin: 0; font-size: 0.74rem;
  }
  dt { color: var(--text-muted, #8b93a3); }
  /* Its sibling `ConflictInspector` marked its `dd` as a figure column and this one never did,
     though both report measured values in the same rail — a clearance in one, a diameter and
     a length in the other. Same treatment now. */
  dd { margin: 0; font-family: var(--st-mono); font-variant-numeric: tabular-nums; }
  .hint { margin: 0; font-size: 0.72rem; color: var(--text-muted, #8b93a3); }
  .sel-status { margin: 0.3rem 0 0; font-size: 0.74rem; }
  /* The same amber the workspace banner uses. One colour, one meaning — so this pair and
     `TorsionBanner`'s moved to the tokens together. Tokenising one of the two would have
     broken the equality this comment exists to state. */
  .sel-torsion { margin: 0.25rem 0 0; font-size: 0.74rem; color: var(--st-text); }
  .sel-torsion strong { color: var(--st-warn); }
  .lim { color: var(--text-muted, #8b93a3); }
  /*
    The pin's reach is a SENTENCE, so it leaves the figure rail its `dd` sits in: the tabular
    numerals and the monospace are for a diameter and a length, and a clause set in them reads
    as data. `--st-blue-text` is 5.36 on ink and is the same hue the pinned row is ruled with
    one component over.
  */
  dd[data-lock='pinned'] { color: var(--st-blue-text); }
  /*
    `--st-text-2` and NOT the `var(--text-muted, #8b93a3)` its neighbours use.

    That fallback is the raw-colour debt `concrete-design-raw-colours.test.ts` records and
    refuses to let grow, and it was right to fail on this line: copying the shape of the code
    around it is how a recorded debt becomes a convention. The token resolves to the same
    reading weight and is on the system.
  */
  .pin-reach {
    display: block;
    font-family: var(--st-sans);
    font-variant-numeric: normal;
    font-size: 0.7rem;
    line-height: 1.35;
    color: var(--st-text-2);
  }
  .sel-reason {
    margin: 0.15rem 0 0; font-size: 0.7rem; line-height: 1.35;
    color: var(--text-muted, #8b93a3);
  }
  .sel-actions { display: flex; gap: 0.35rem; margin-top: 0.3rem; }
  .sel-actions button {
    background: none; border: 1px solid var(--st-border, #2c3444); border-radius: 4px;
    color: inherit; font-size: 0.72rem; padding: 0.2rem 0.45rem; cursor: pointer;
  }
  .sel-actions button:hover { border-color: var(--st-interactive); color: var(--st-text); }
</style>
