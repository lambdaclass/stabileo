<script lang="ts">
  /**
   * The reinforcement summary in the sidebar, and the way into the workspace.
   *
   * ── Why the viewer is not here any more ────────────────────────────
   *
   * It used to be, and it was a few hundred pixels wide. This panel is nested inside
   * `aside.pro-sidebar`, whose width is a fixed pixel value, so every attempt to give the
   * canvas room was capped by an ancestor several levels up. Inspecting a cage of thousands of
   * bars through that slot is what the QA pass found.
   *
   * So the canvas moved to a full-window overlay mounted at App level, and what stays here is
   * what a sidebar is good at: the numbers at a glance, the members that need attention, the
   * export, and one button into the workspace.
   *
   * ── What it still refuses to hide ─────────────────────────────────
   *
   * The members with no reinforcement are named here as well as in the workspace, with the
   * reason each one has none. A user who never opens the workspace still has to know they
   * exist — that was the original defect and closing the overlay must not bring it back.
   */
  import { t, tp, i18n } from '../../../lib/i18n';
  import { buildOutcomeSummaries } from '../../../lib/store/element-status-join';
  import { modelStore } from '../../../lib/store/model.svelte';
  import { verificationStore } from '../../../lib/store/verification.svelte';
  import { rebarWorkspace } from '../../../lib/store/rebar-workspace.svelte';
  import { summariseScene } from '../../../lib/engine/detailing/scene-model';
  import { membersFromModel } from '../../../lib/engine/detailing/member-geometry';
  import { cachedSceneModel } from '../../../lib/engine/detailing/scene-cache';
  import {
    reportElementStatus, ELEMENT_STATUS_ORDER, type DesignOutcomeSummary,
  } from '../../../lib/engine/detailing/element-status';
  import { renderDrawings } from '../../../lib/engine/detailing/document-render';
  import type { DocumentModel } from '../../../lib/engine/detailing/document-model';

  interface Props {
    /** The document to project. Null when nothing has been coordinated yet. */
    doc: DocumentModel | null;
    /** How the panel hands a finished file back to the workflow that owns downloads. */
    ondownload: (name: string, type: string, content: string) => void;
  }

  const { doc, ondownload }: Props = $props();

  const built = $derived.by(() => {
    if (!doc) return null;
    const elementIds = [...modelStore.model.elements.keys()].sort((a, b) => a - b);
    const { members, refused } = membersFromModel({
      elementIds,
      nodes: [...modelStore.model.nodes.values()],
      elements: [...modelStore.model.elements.values()],
      sections: [...modelStore.model.sections.values()],
    });
    /**
       * Cached against the document and the member geometry.
       *
       * Sampling 20 917 bars is the expensive step, and it was repeated on every reactive
       * touch because `membersFromModel` returns a fresh array each call. The cache answers
       * the only question that matters — same document, same members — so a checkbox, a
       * slider or a selection no longer rebuilds the projection.
       */
      return { scene: cachedSceneModel(doc, members), refused };
  });

  const summary = $derived(built ? summariseScene(built.scene) : null);

  const report = $derived(
    built ? reportElementStatus(built.scene, buildOutcomeSummaries()) : null);

  /** Why each unreinforced member has no steel, joined from its design outcome. */
  const unreinforced = $derived.by(() => {
    if (!built) return [];
    return built.scene.unreinforcedMembers.map((id) => {
      const o = verificationStore.outcomeFor(id);
      return { id, outcome: o?.outcome ?? null, reason: o?.reasons?.[0] ?? null };
    });
  });

  const assemblyIds = $derived(
    built ? [...new Set(built.scene.bars.map((b) => b.assemblyId))].sort() : []);

  function fmt(n: number, digits = 2): string {
    return n.toLocaleString(i18n.locale, {
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    });
  }

  /** Export the sheets for every assembly the document carries. */
  function exportSheets() {
    if (!doc || assemblyIds.length === 0) return;
    const set = renderDrawings(doc, {
      locale: i18n.locale, projectName: t('detailing.doc.project'),
    });
    ondownload(`detailing-rev${doc.revision.number}-3d.dxf`, 'application/dxf', set.dxf);
  }
</script>

<section class="rebar-scene" data-testid="rebar-scene">
  <header>
    <h4>{t('detailing.scene.title')}</h4>
    {#if built}
      <p class="sub">
        {tp('detailing.scene.subtitle', {
          revision: built.scene.revision,
          readiness: t(`detailing.doc.readiness.${built.scene.readiness}`),
        })}
      </p>
    {/if}
  </header>

  {#if !built || built.scene.bars.length === 0}
    <p class="empty" data-testid="rebar-empty">{t('detailing.scene.empty')}</p>
  {:else}
    <button
      class="open"
      type="button"
      data-testid="rebar-open-workspace"
      onclick={() => rebarWorkspace.openWorkspace()}
    >
      {t('detailing.scene.openWorkspace')}
    </button>
    <p class="hint">{t('detailing.scene.panelHint')}</p>

    {#if summary}
      <p class="summary" data-testid="rebar-summary">
        {tp('detailing.scene.summary', {
          bars: summary.barCount,
          length: fmt(summary.totalLength),
          mass: fmt(summary.massKg, 1),
        })}
        {#if summary.conflictedBars > 0}
          <strong class="warn">
            · {tp('detailing.scene.conflictedCount', { n: summary.conflictedBars })}
          </strong>
        {/if}
      </p>
    {/if}

    <!-- Every state present, with its count. Never collapsed into a single "not ready". -->
    {#if report}
      <ul class="states" data-testid="rebar-panel-states">
        {#each ELEMENT_STATUS_ORDER as s (s)}
          {#if report.counts[s] > 0}
            <li data-testid={`rebar-panel-state-${s}`}>
              <span class="dot {s.toLowerCase().replace(/_/g, '-')}"></span>
              {t(`detailing.scene.status.${s}`)}
              <strong>{report.counts[s]}</strong>
            </li>
          {/if}
        {/each}
      </ul>
    {/if}

    {#if unreinforced.length > 0}
      <div class="unreinforced" data-testid="rebar-unreinforced">
        <h5>{tp('detailing.scene.unreinforcedCount', { n: unreinforced.length })}</h5>
        <ul>
          {#each unreinforced as u (u.id)}
            <li>
              <strong>{tp('detailing.scene.solid.member', { id: u.id })}</strong>
              {#if u.reason}
                <span class="why">{tp(u.reason.key, u.reason.params ?? {})}</span>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if built.refused.length > 0}
      <p class="note" data-testid="rebar-unresolved">
        {tp('detailing.scene.unresolved', {
          n: built.refused.length,
          ids: built.refused.map((r) => r.elementId).join(', '),
        })}
        <span class="why">{t('detailing.scene.unresolvedWhy')}</span>
      </p>
    {/if}

    <div class="export">
      <button
        type="button"
        onclick={exportSheets}
        data-testid="rebar-export"
        disabled={assemblyIds.length === 0}
      >
        {t('detailing.scene.exportVisible')}
      </button>
      <span class="scope" data-testid="rebar-scope">
        {#if assemblyIds.length === 0}
          {t('detailing.scene.exportNothing')}
        {:else}
          {tp('detailing.scene.exportScope', {
            n: assemblyIds.length, ids: assemblyIds.join(', '),
          })}
        {/if}
      </span>
    </div>
  {/if}
</section>

<style>
  .rebar-scene { display: flex; flex-direction: column; gap: 0.5rem; }
  header h4 { margin: 0; font-size: 0.95rem; }
  .sub, .hint, .note, .empty {
    margin: 0; font-size: 0.78rem; color: var(--text-muted, #8b93a3);
  }
  /*
     `--st-blue` and not `--st-accent`, deliberately.
     `--st-accent` is documented as "primary action, brand" and this is one — but the
     application also fills its DESTRUCTIVE buttons with it (`ProReportDialog`'s
     `.rpt-btn-danger`, `ProAutoLoadsDialog`'s `.al-error`), so a vermillion "open workspace"
     would read as a warning. `--st-blue` is the token whose value this literal already was
     (#2c6cb4 against #2b6cb0), and `--st-text-on-accent` is exactly the `#fff` it replaces.
  */
  .open {
    align-self: flex-start;
    font-size: 0.82rem; padding: 0.35rem 0.75rem; cursor: pointer;
    background: var(--st-blue); color: var(--st-text-on-accent);
    border: none; border-radius: 4px;
  }
  .summary { margin: 0; font-size: 0.82rem; }
  /*
     Frozen, with the eight below it. `.warn` names the CONFLICTED bar count and `#e0444a` is
     `conflicted: 0xe0444a` in `three/rebar-scene.ts`; `.unreinforced`'s rule is
     `unreinforced: 0xd4762a`. A material cannot read a custom property, so a token here would
     let the words and the picture drift — and `--st-danger` is a different red (#e8705f),
     which would put two reds for one meaning in one panel. See
     `concrete-status-tokens.test.ts`, which asserts the mirror in both directions.
  */
  .warn { color: #e0444a; }
  .states { list-style: none; margin: 0; padding: 0; font-size: 0.76rem; }
  .states li { display: flex; align-items: center; gap: 0.35rem; padding: 0.05rem 0; }
  .states strong { margin-left: auto; font-variant-numeric: tabular-nums; }
  .dot { width: 0.55rem; height: 0.55rem; border-radius: 50%; }
  .dot.failed { background: #e0444a; }
  .dot.unsupported { background: #b06ad6; }
  .dot.refused { background: #d4762a; }
  .dot.designed-not-modelled { background: #d9c04a; }
  .dot.not-evaluated { background: #8b93a3; }
  .dot.modelled { background: #4caf72; }
  .unreinforced {
    border-left: 3px solid #d4762a;
    padding: 0.3rem 0 0.3rem 0.55rem;
  }
  .unreinforced h5 { margin: 0 0 0.2rem; font-size: 0.8rem; }
  .unreinforced ul { margin: 0; padding-left: 1rem; font-size: 0.76rem; }
  .unreinforced li { margin-bottom: 0.15rem; }
  .why { display: block; color: var(--text-muted, #8b93a3); }
  .export { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .export .scope { font-size: 0.74rem; color: var(--text-muted, #8b93a3); }
</style>
