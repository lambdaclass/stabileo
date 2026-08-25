<script lang="ts">
  /**
   * Which families "Design all" designs, and what it did.
   *
   * ── The workflow this closes ───────────────────────────────────────
   *
   * "Diseñar todo" designed beams and columns. Slabs, walls and foundations came from a second
   * command in a different disclosure, so the button named "all" produced a building with no
   * floors and said nothing about it — the user found out from the 3-D view. One selection now
   * drives one run.
   *
   * ── Why the result lives here too ──────────────────────────────────
   *
   * Because the question after pressing the button is always "what did that do", and the
   * answer was previously spread across three panels. Processed, designed, refused and
   * not-modelled per family, then the ways out: the 3-D view and the exports, beside the
   * numbers rather than hunted for.
   */
  import { t, tp } from '../../../lib/i18n';
  import { designRunStore } from '../../../lib/store/design-run.svelte';
  import { verificationStore } from '../../../lib/store';
  import { modelStore } from '../../../lib/store/model.svelte';
  import { detailingStore } from '../../../lib/store/detailing.svelte';
  import { rebarWorkspace } from '../../../lib/store/rebar-workspace.svelte';
  import {
    DESIGN_FAMILIES, availableDesignFamilies, totalsOf,
    type DesignFamily, type DesignRunReport,
  } from '../../../lib/engine/design/design-families';

  interface Props {
    /** Whether the upstream commands can run at all. */
    canDesign: boolean;
    /** Build the document so the 3-D view and the exports have one to project. */
    onView3d: () => void;
  }
  const { canDesign, onView3d }: Props = $props();

  /**
   * The selection, defaulting to everything except foundations.
   *
   * Session state, not project state: it is a statement about what the user wants to run now,
   * not a property of the structure. Persisting it into the project would make a saved file
   * carry someone's last click as if it were a design decision.
   */
  /**
   * The scope of the next run lives in the store, not here.
   *
   * The command that runs it is in the command bar, a component away. While this was local
   * state there had to be a second button beside the boxes to reach it — and two buttons that
   * design different scopes is the contradiction §2 names. There is one command now, and it
   * reads this.
   */
  const selection = $derived(designRunStore.familySelection);

  /**
   * Which families this model can be asked to design at all.
   *
   * Beams and columns come from the classified members. Slabs and walls are offered together
   * whenever the model holds shell panels, because a shell becomes one or the other only when
   * the floor pass classifies it — deciding here would be a second authority, and the census
   * below already refuses to guess. Footings come from the model's own footing list.
   */
  const available = $derived(availableDesignFamilies({
    /*
     * Frame members, from the MODEL — not from `verificationStore.contexts`.
     *
     * The contexts are populated by the demand pass, so keying availability on them offered no
     * boxes at all on a freshly loaded building: the two families every reinforced-concrete
     * frame has disappeared until the user had already run the step the selector is supposed to
     * scope. Beams and columns are offered whenever there are frame elements; the census column
     * beside each box is what says how many, and it already answers "unknown" when it cannot
     * count yet.
     */
    column: modelStore.elements.size,
    beam: modelStore.elements.size,
    /*
     * Slabs and walls together, whenever the model holds shell panels. A shell becomes one or
     * the other only when the floor pass classifies it; deciding here would be a second
     * authority, and the census already refuses to guess.
     */
    slab: shellCount,
    wall: shellCount,
    footing: modelStore.model.footings.size,
  }));

  /*
   * There is no second, "effective" scope here.
   *
   * An earlier version pruned the store's selection in an `$effect`, and that was destructive:
   * on a project with no model nothing is available, so it wiped the default to empty — and
   * since pruning only removes, beams and columns never came back once a model loaded. The
   * command sat disabled on a perfectly designable building.
   *
   * The selector only OFFERS families the model has, so the stored intent cannot name a phantom
   * one in practice; and if it ever did, the run already reports `noElements` for a family the
   * model does not contain rather than failing. Intent stays intent.
   */
  /**
   * The last run's report, read from the store.
   *
   * It used to be local `$state` filled by this panel's own run button. F2 moved the command to
   * the bar and removed that button, which left the assignment unreachable — so the report block
   * silently stopped appearing, and with it the distinction between a family SKIPPED because it
   * was not asked for and one with NO MEMBERS because the model has none. Three E2E tests caught
   * it; the fix is that the run and its report live in the same place.
   */
  const report = $derived(designRunStore.lastFamilyReport);
  let running = $state(false);

  const summary = $derived(
    selection.length === 0
      ? t('design.families.none')
      : tp('design.families.summary', {
        list: selection.map((f) => t(`design.families.${f}`)).join(', '),
      }));

  function toggle(f: DesignFamily) {
    designRunStore.setFamilySelection(selection.includes(f)
      ? selection.filter((x) => x !== f)
      : [...selection, f]);
  }

  const totals = $derived(report ? totalsOf(report) : null);

  /**
   * How many members of each family the MODEL holds, before anything is run.
   *
   * Read from the same places the run reads, never re-derived:
   *
   * - `column` / `beam` come from `verificationStore.contexts`, which is the exact map
   *   `designFamilies` splits the frame pass on. Counting them any other way would let this
   *   panel and the run disagree about what a beam is.
   * - `footing` is a modelled entity with its own map.
   * - `slab` / `wall` are `null` — deliberately. A shell becomes a slab or a wall when the floor
   *   pass classifies it, and that classification is the engine's, not this panel's. The model
   *   knows it holds N shell panels and nothing more; saying "0 slabs" before the pass would be a
   *   fabricated zero, and guessing from geometry would be a second authority.
   */
  const census = $derived.by((): Record<DesignFamily, number | null> => {
    let column = 0;
    let beam = 0;
    for (const [, ctx] of verificationStore.contexts) {
      const t = (ctx as { elementType?: string }).elementType;
      if (t === 'column') column += 1;
      else if (t === 'beam') beam += 1;
    }
    const floors = detailingStore.lastFloorRun;
    const perFamily = (f: string): number | null => {
      if (!floors) return null;
      return (floors.assemblies ?? [])
        .flatMap((a: { families?: { family: string }[] }) => a.families ?? [])
        .filter((r: { family: string }) => r.family === f).length;
    };
    return {
      column, beam,
      slab: perFamily('slab'),
      wall: perFamily('wall'),
      footing: modelStore.model.footings.size,
    };
  });

  /** Shell panels in the model — the honest number behind an unknown slab/wall split. */
  const shellCount = $derived(modelStore.model.quads.size);

  /**
   * Where a family stands, in the seven states a reviewer actually distinguishes.
   *
   * The engine reports four (`designed` / `skipped` / `noElements` / `failed`). The three this
   * adds are not new authority: `notRun` is the absence of a report, `refused` and `provisional`
   * are counts the same report already carries, promoted to the row because "designed" with
   * eleven refusals in it is not the same answer as "designed".
   */
  function stateOf(f: DesignFamily): { id: string; glyph: string; label: string } {
    const r = report?.families.find((x) => x.family === f);
    if (!r) {
      return selection.includes(f)
        ? { id: 'notRun', glyph: '·', label: t('design.families.state.notRun') }
        : { id: 'skipped', glyph: '○', label: t('design.families.state.skipped') };
    }
    if (r.state === 'failed') {
      return { id: 'failed', glyph: '✕', label: t('design.families.state.failed') };
    }
    if (r.state === 'noElements') {
      return { id: 'noElements', glyph: '—', label: t('design.families.state.noElements') };
    }
    if (r.state === 'skipped') {
      return { id: 'skipped', glyph: '○', label: t('design.families.state.skipped') };
    }
    if (r.refused > 0) {
      return {
        id: 'refused', glyph: '⚠',
        label: tp('design.families.state.refused', { n: r.refused }),
      };
    }
    if (provisionalCount > 0) {
      return { id: 'provisional', glyph: '◐', label: t('design.families.state.provisional') };
    }
    return { id: 'designed', glyph: '✓', label: t('design.families.state.designed') };
  }

  const provisionalCount = $derived(designRunStore.provisionalIds.size);
</script>

<section class="families" data-testid="design-families">
  <h4>{t('design.families.title')}</h4>
  <!--
    What this runs, and how it differs from the command above.

    Both buttons used to read "Design all". They are not the same command: the one on the command
    row designs the FRAME, this one designs whichever families are ticked here — including slabs,
    walls and, if asked, foundations. Two identical labels for two different scopes is the
    ambiguity this subtitle and the button's new wording remove.
  -->
  <p class="subtitle" data-testid="design-families-subtitle">{t('design.families.subtitle')}</p>

  <!--
    What each of the three commands covers, side by side.

    Three buttons in this tab start a design, they have different scopes, and nothing said so:
    `Design all` on the command row, `Design the ticked families` here, and
    `Size and detail floors` in its own section. A user who has to discover the difference by
    pressing them is running structural design to find out what a button does.
  -->
  <dl class="scopes" data-testid="design-families-scopes">
    <div><dt>{t('design.families.scope.allTitle')}</dt><dd>{t('design.families.scope.all')}</dd></div>
    <div><dt>{t('design.families.scope.pickedTitle')}</dt><dd>{t('design.families.scope.picked')}</dd></div>
    <div><dt>{t('design.families.scope.floorsTitle')}</dt><dd>{t('design.families.scope.floors')}</dd></div>
  </dl>

  <!--
    One row per family: the box, what the model holds, and where that family stands.

    The boxes used to be five bare labels. Ticking `footing` on a building with no footings, or
    leaving `slab` unticked, looked identical — and after a run the section below the text was
    empty until someone pressed the button, which is what made this section read as unfinished.
    The census and the state are here BEFORE anything runs.
  -->
  <ul class="boxes" data-testid="design-family-rows">
    {#each available as f (f)}
      {@const c = census[f]}
      {@const st = stateOf(f)}
      <li class="frow" data-testid={`design-family-row-${f}`} data-state={st.id}>
        <label>
          <input
            type="checkbox"
            data-testid={`design-family-${f}`}
            checked={selection.includes(f)}
            onchange={() => toggle(f)}
          />
          <span class="fname">{t(`design.families.${f}`)}</span>
        </label>
        <!-- What the model holds. `null` means the count is not knowable until the pass runs. -->
        <span class="census" data-testid={`design-family-census-${f}`}>
          {c === null ? t('design.families.census.unknown') : tp('design.families.census.n', { n: c })}
        </span>
        <!-- Glyph AND word: the state never depends on the colour. -->
        <span class="fstate" data-testid={`design-family-state-${f}`}>
          <span aria-hidden="true">{st.glyph}</span> {st.label}
        </span>
      </li>
    {/each}
  </ul>

  <div class="bulk">
    <button type="button" data-testid="design-family-all"
            onclick={() => designRunStore.setFamilySelection(available)}>
      {t('design.families.selectAll')}
    </button>
    <button type="button" data-testid="design-family-none"
            onclick={() => designRunStore.setFamilySelection([])}>
      {t('design.families.clear')}
    </button>
  </div>

  <p class="summary" data-testid="design-family-summary">{summary}</p>
  <!-- Stated where the box is, so leaving foundations out is a visible choice. -->
  <p class="note">{t('design.families.footingNote')}</p>
  <!-- What this command will NOT touch, whatever is ticked. -->
  <p class="note" data-testid="design-families-untouched">{t('design.families.untouched')}</p>
  {#if shellCount === 0 && census.column === 0 && census.beam === 0 && census.footing === 0}
    <!-- Not a blank area under a paragraph: the reason there is nothing to tick, in words. -->
    <p class="empty-state" data-testid="design-families-empty">{t('design.families.emptyModel')}</p>
  {:else if census.slab === null || census.wall === null}
    <p class="hint" data-testid="design-families-shells">
      {tp('design.families.shellsPending', { n: shellCount })}
    </p>
  {/if}

  <!--
    No run button here.

    There used to be one — `cmd-design-families` — beside the boxes, next to `cmd-design-all` in
    the command bar. Two commands that design different scopes is the contradiction §2 names, and
    a user could not tell from either label which one covered what. The command bar's button runs
    THIS selection now and states its scope beside itself; this panel chooses the scope and
    reports what the run did.
  -->

  {#if report}
    <div class="result" data-testid="design-family-result">
      <h5>{t('design.families.result')}</h5>
      <p class="cols">{t('design.families.cols')}</p>
      <table>
        <tbody>
          {#each report.families as f (f.family)}
            <tr data-testid={`design-result-${f.family}`} class={f.state}>
              <th scope="row">{t(`design.families.${f.family}`)}</th>
              <td class="state">{t(`design.families.state.${f.state}`)}</td>
              {#if f.state === 'designed'}
                <td>{f.processed}</td>
                <td>{f.designed}</td>
                <td>{f.refused}</td>
                <td>{f.notModelled}</td>
              {:else}
                <td colspan="4">—</td>
              {/if}
            </tr>
            {#if f.errorKey}
              <tr class="err"><td colspan="6">{tp(f.errorKey, f.errorParams ?? {})}</td></tr>
            {/if}
          {/each}
        </tbody>
      </table>

      {#if totals}
        <p class="totals" data-testid="design-family-totals">
          {totals.processed} / {totals.designed} / {totals.refused} / {totals.notModelled}
        </p>
      {/if}

      <!-- The ways out, beside the numbers rather than hunted for in another panel. -->
      <div class="actions">
        <button
          type="button"
          class="primary"
          data-testid="design-result-view-3d"
          disabled={detailingStore.assemblies.length === 0
            && (detailingStore.document?.assemblies.length ?? 0) === 0}
          onclick={() => { onView3d(); rebarWorkspace.openWorkspace(); }}
        >
          {t('detailing.scene.openWorkspace')}
        </button>
      </div>
    </div>
  {/if}
</section>

<style>
  .subtitle {
    margin: 0 0 0.4rem;
    font-size: 0.7rem;
    color: var(--st-text-2);
    line-height: 1.35;
  }
  .families { display: flex; flex-direction: column; gap: 0.4rem; }
  h4, h5 { margin: 0; font-size: 0.85rem; }
  /*
    One row per family, not a wrapping strip of five labels.

    The box, the census and the state are three columns, so the states line up under each other
    and "which families are actually in this model" is answerable by reading down rather than by
    parsing a paragraph.
  */
  .boxes { list-style: none; margin: 0.3rem 0; padding: 0; display: flex; flex-direction: column; gap: 0.1rem; }
  .frow {
    display: grid;
    grid-template-columns: minmax(6rem, 1fr) auto auto;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.1rem 0;
    border-bottom: 1px solid var(--st-hair);
    font-size: 0.72rem;
  }
  .frow label { display: inline-flex; align-items: baseline; gap: 0.35rem; cursor: pointer; min-width: 0; }
  .frow input:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
  .fname { color: var(--st-text); }
  .census { color: var(--st-text-2); font-size: 0.68rem; white-space: nowrap; }
  .fstate { font-size: 0.68rem; font-weight: 600; color: var(--st-text-2); white-space: nowrap; }
  /* Colour supports the glyph and the word; it never carries the state alone. */
  .frow[data-state='designed'] .fstate { color: var(--st-ok); }
  .frow[data-state='refused'] .fstate,
  .frow[data-state='provisional'] .fstate { color: var(--st-warn); }
  .frow[data-state='failed'] .fstate { color: var(--st-danger); }
  .frow[data-state='noElements'] .fstate,
  .frow[data-state='skipped'] .fstate { color: var(--st-text-2); }

  /* The three scopes, so the difference is read rather than discovered by pressing. */
  .scopes { margin: 0.35rem 0; display: flex; flex-direction: column; gap: 0.2rem; }
  .scopes div { display: grid; grid-template-columns: 1fr; gap: 0.05rem; }
  .scopes dt { font-size: 0.68rem; font-weight: 600; color: var(--st-text); }
  .scopes dd { margin: 0; font-size: 0.66rem; line-height: 1.35; color: var(--st-text-2); }

  .empty-state {
    margin: 0.4rem 0 0;
    padding: 0.5rem 0.6rem;
    border: 1px dashed var(--st-hair-strong);
    border-radius: 4px;
    font-size: 0.7rem;
    color: var(--st-text-2);
  }
  .hint { margin: 0.3rem 0 0; font-size: 0.66rem; color: var(--st-text-2); line-height: 1.35; }
  label {
    display: flex; align-items: center; gap: 0.3rem;
    font-size: 0.78rem; cursor: pointer;
  }
  .bulk { display: flex; gap: 0.4rem; }
  /*
    Off the ad-hoc palette and onto the tokens.

    This file used a hardcoded blue for its primary buttons and two variables outside the `--st-*`
    system elsewhere, each with a hex fallback that would silently win if the variable were ever
    undefined. The blue appeared nowhere else in PRO. Same tokens as every other section now, and
    a focus ring, which none of these controls had.
  */
  .bulk button {
    font-size: 0.7rem; padding: 0.12rem 0.45rem; cursor: pointer;
    background: none; border: 1px solid var(--st-hair-strong); border-radius: 3px;
    color: var(--st-text-2);
  }
  .bulk button:hover { background: var(--st-surface-3); color: var(--st-text); }
  .summary { margin: 0; font-size: 0.78rem; }
  .note, .cols { margin: 0; font-size: 0.7rem; color: var(--st-text-2); }
  .run {
    align-self: flex-start; font-size: 0.74rem; font-weight: 600;
    padding: 0.25rem 0.7rem; cursor: pointer;
    background: var(--st-surface-3); color: var(--st-text);
    border: 1px solid var(--st-interactive); border-radius: 4px;
  }
  .run:hover:not(:disabled) { background: var(--st-hair-strong); }
  /* Dimmer and still readable — a disabled command has to be legible to explain itself. */
  .run:disabled { opacity: 0.6; cursor: not-allowed; border-color: var(--st-hair-strong); }
  .result { border-top: 1px solid var(--st-hair); padding-top: 0.35rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.74rem; }
  th { text-align: left; font-weight: 400; }
  td { text-align: right; font-variant-numeric: tabular-nums; }
  td.state { text-align: left; color: var(--st-text-2); }
  tr.skipped, tr.noElements { opacity: 0.6; }
  /* `#e0444a` is also `conflicted: 0xe0444a` in the 3-D scene, and that is a coincidence, not
     a contract: this is the design results table and the viewer paints nothing in it. So the
     token applies — and it reads better, 4.89 at worst against this red's own 4.2. */
  tr.failed td.state { color: var(--st-danger); }
  .err td { text-align: left; color: var(--st-danger); font-size: 0.72rem; }
  .totals { margin: 0.2rem 0 0; font-size: 0.76rem; font-variant-numeric: tabular-nums; }
  .actions { margin-top: 0.4rem; }
  .actions .primary {
    font-size: 0.74rem; font-weight: 600; padding: 0.25rem 0.7rem; cursor: pointer;
    background: var(--st-surface-3); color: var(--st-text);
    border: 1px solid var(--st-interactive); border-radius: 4px;
  }
  .actions .primary:hover:not(:disabled) { background: var(--st-hair-strong); }
  .actions .primary:disabled { opacity: 0.6; cursor: not-allowed; border-color: var(--st-hair-strong); }

  /* One focus ring for every control in this section. There was none. */
  .bulk button:focus-visible, .run:focus-visible, .actions .primary:focus-visible {
    outline: 2px solid var(--st-value);
    outline-offset: 1px;
  }
</style>
