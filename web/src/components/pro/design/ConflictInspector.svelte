<script lang="ts">
  /**
   * What a red dot in the cage actually is.
   *
   * ── The click this answers ─────────────────────────────────────
   *
   * The 7-storey building draws forty thousand conflict markers, and until now none of them
   * could be clicked. A marker said "something is wrong HERE" and offered no way to ask what:
   * the only route to the answer was the detailing panel's conflict list, which is ordered by
   * assembly and has forty thousand rows. Seeing the problem and identifying it were separate
   * activities with no bridge between them.
   *
   * So every field a reviewer needs is here, beside the geometry, and each is a fact the
   * document already carried and nothing had shown: both bar ids separately, the measured
   * clearance against what was required, the severity, the pair class the rule was chosen
   * from, and the members the two bars belong to.
   *
   * ── Why both bars are listed separately ────────────────────────
   *
   * Because "bars A/B are 14 mm apart" is a measurement and "bar c12-4 in column 12 is 14 mm
   * from bar b31-2 in beam 88" is something an engineer can act on. A conflict nobody can
   * trace back to two real bars in two real members is a number, not a finding.
   */
  import { t, tp } from '../../../lib/i18n';
  import { rebarWorkspace } from '../../../lib/store/rebar-workspace.svelte';
  import type { SceneConflictMarker } from '../../../lib/engine/detailing/scene-model';

  interface Props {
    conflict: SceneConflictMarker;
  }
  const { conflict }: Props = $props();

  const mm = (m: number): string => (m * 1000).toFixed(1);
  const isolated = $derived(rebarWorkspace.isolated.length > 0);
</script>

<div class="conflict" data-testid="rebar-conflict-inspector">
  <p class="head" class:overlap={conflict.severity === 'overlap'}>
    <strong data-testid="rebar-conflict-severity">
      {t(`detailing.scene.conflict.severity.${conflict.severity}`)}
    </strong>
    <span data-testid="rebar-conflict-class">{conflict.pairClass}</span>
  </p>

  <dl>
    <dt>{t('detailing.scene.conflict.barA')}</dt>
    <dd data-testid="rebar-conflict-bar-a">{conflict.barIds[0]}</dd>
    <dt>{t('detailing.scene.conflict.barB')}</dt>
    <dd data-testid="rebar-conflict-bar-b">{conflict.barIds[1]}</dd>
    <dt>{t('detailing.scene.conflict.measured')}</dt>
    <dd data-testid="rebar-conflict-measured">{mm(conflict.clearance)} mm</dd>
    <dt>{t('detailing.scene.conflict.required')}</dt>
    <dd data-testid="rebar-conflict-required">{mm(conflict.required)} mm</dd>
    <dt>{t('detailing.scene.conflict.shortfall')}</dt>
    <dd data-testid="rebar-conflict-shortfall">{mm(conflict.shortfall)} mm</dd>
    <dt>{t('detailing.scene.parentElement')}</dt>
    <dd data-testid="rebar-conflict-parent">{conflict.elementIds.join(', ') || '—'}</dd>
    <dt>{t('detailing.scene.assembly')}</dt>
    <dd data-testid="rebar-conflict-assembly">{conflict.assemblyId}</dd>
  </dl>

  <!--
    The consequence, on the inspector and not only in the report. A reviewer looking at one
    conflict is the reader most likely to conclude "that's only 4 mm, fine".
  -->
  <p class="warn" data-testid="rebar-conflict-warning">
    {t('detailing.scene.conflict.notConstructible')}
  </p>

  <div class="actions">
    <button
      type="button"
      data-testid="rebar-conflict-centre"
      onclick={() => rebarWorkspace.selectConflict(conflict)}
    >{t('detailing.scene.conflict.centre')}</button>
    {#if isolated}
      <button
        type="button"
        data-testid="rebar-conflict-clear-isolation"
        onclick={() => rebarWorkspace.clearIsolation()}
      >{t('detailing.scene.clearIsolation')}</button>
    {:else}
      <button
        type="button"
        data-testid="rebar-conflict-isolate"
        onclick={() => rebarWorkspace.selectConflict(conflict, { isolateMembers: true })}
      >{tp('detailing.scene.conflict.isolate', { n: conflict.elementIds.length })}</button>
    {/if}
  </div>
</div>

<style>
  .conflict { display: flex; flex-direction: column; gap: 0.35rem; }
  .head {
    margin: 0; display: flex; gap: 0.5rem; align-items: baseline;
    font-size: 0.78rem; color: var(--st-text);
  }
  /*
     Interpenetration and a spacing shortfall are different problems; the header says which
     before the numbers do.

     Two pinks encoded that: `#ffb0b6` for every header and a brighter `#ff6b74` on the strong
     when the class is `overlap`. The DIFFERENCE is what carries meaning, so the base goes to
     `--st-text` and the emphasis to `--st-danger` — the alternative, base `--st-danger` with
     nothing stronger left for overlap, would have merged the two. The card still reads as an
     error from the band below it, whose rule is the conflict red.
  */
  .head.overlap strong { color: var(--st-danger); }
  .head span { color: var(--text-muted, #8b93a3); font-size: 0.7rem; }
  dl {
    display: grid; grid-template-columns: auto 1fr; gap: 0.1rem 0.5rem;
    margin: 0; font-size: 0.74rem;
  }
  dt { color: var(--text-muted, #8b93a3); }
  dd { margin: 0; font-family: var(--st-mono); font-variant-numeric: tabular-nums; }
  .warn {
    margin: 0.2rem 0 0; padding: 0.3rem 0.4rem;
    /* Fill and rule frozen: `#e0444a` is `conflicted: 0xe0444a` in the 3-D scene and the
       0.14 fill is that same hue, so they move together or not at all. The SENTENCE takes
       `--st-text`, which is the trade `FootingMatPhysicalPanel` measured — a status hue as
       body text costs more contrast than it buys. */
    background: rgba(224, 68, 74, 0.14); border-left: 2px solid #e0444a;
    color: var(--st-text); font-size: 0.72rem; line-height: 1.35;
  }
  .actions { display: flex; gap: 0.35rem; flex-wrap: wrap; }
  .actions button {
    background: none; border: 1px solid var(--st-border, #2c3444); border-radius: 4px;
    color: inherit; font-size: 0.72rem; padding: 0.2rem 0.45rem; cursor: pointer;
  }
  .actions button:hover { border-color: var(--st-interactive); color: var(--st-text); }
</style>
