<script lang="ts">
  /**
   * The Detalle stage's grouped element list — objectives 1 and 2 of §8.
   *
   * ── What this component is NOT allowed to do ───────────────────────
   *
   * It does not group. `rc-selection.ts` owns that — `rcGroupOf`, `rcFamiliesIn`,
   * `rcGroupLabelKey` — and `rc-member-list.ts` owns the census built on top of it. Everything
   * below reads those and renders; a second grouping here is how the list and the layer switches
   * come to disagree about which family a pedestal is.
   *
   * It does not hold a selection. `rebarWorkspace.selection` is the single channel, and objective
   * 3 will write to it from these rows. Local selection state is precisely the second channel the
   * contract was written to prevent, so there is none — `selectedIds` below is a READ of the
   * channel, never a copy of it.
   *
   * It does not read `AssemblyKind`. `run-detailing.ts` builds one assembly per level, always
   * `beamLine`, holding that level's beams AND columns; a count taken from it would file every
   * column under beams. Families come from the verification contexts, which classify per element.
   *
   * ── The three states, on screen ────────────────────────────────────
   *
   *   present   the family's total, and how many of them are detailed
   *   unknown   "not counted yet" — candidates exist, nothing has classified them
   *   absent    no heading, no rows, nothing selectable
   *
   * `unknown` is rendered, always. Hiding it would tell someone their building has no columns
   * because they have not pressed Compute demands yet.
   */
  import { t, tp } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store/model.svelte';
  import { verificationStore } from '../../../lib/store';
  import { detailingStore } from '../../../lib/store/detailing.svelte';
  import { rebarWorkspace } from '../../../lib/store/rebar-workspace.svelte';
  import {
    rcMemberList, rcHasListableMembers, rcHasUnclassifiedFamilies,
    type RcMemberListInput, type RcFamilyCensus,
  } from '../../../lib/flow/rc-member-list';
  import type { SceneSolidKind } from '../../../lib/engine/detailing/scene-model';

  /**
   * Family per element, from the pass that actually classifies them.
   *
   * `MemberContext.elementType` is `'beam' | 'column' | 'wall'` — those three and no more, which
   * is why slabs and pedestals can only ever be `unknown` or `absent` here rather than listed.
   * Footings come from the model's own footing map, which is a real classification and not a
   * guess.
   */
  const membership = $derived.by(() => {
    const m = new Map<number, SceneSolidKind>();
    for (const [id, ctx] of verificationStore.contexts) {
      const type = ctx.elementType;
      if (type === 'beam' || type === 'column' || type === 'wall') m.set(id, type);
    }
    for (const id of modelStore.model.footings.keys()) m.set(id, 'footing');
    return m;
  });

  /** Elements carrying coordinated detailing — the union of every assembly's members. */
  const detailed = $derived.by(() => {
    const s = new Set<number>();
    for (const a of detailingStore.assemblies) for (const id of a.elementIds) s.add(id);
    return s;
  });

  /**
   * What the model holds, where it can be counted at all.
   *
   * Beams and columns are both keyed on the frame element count, for the reason
   * `DesignFamilyPanel` already documents: the demand pass is what tells them apart, so before it
   * runs the honest answer is "there are candidates" rather than a number per family. That is
   * exactly what produces `unknown` instead of `absent`.
   *
   * Slabs and walls are both keyed on the shell count, because which panel is which is the floor
   * pass's decision and guessing here would be a second authority.
   */
  const shellCount = $derived(modelStore.model.quads.size);
  const input = $derived<RcMemberListInput>({
    membership,
    detailed,
    modelCounts: {
      column: modelStore.elements.size,
      beam: modelStore.elements.size,
      slab: shellCount,
      wall: shellCount,
      footing: modelStore.model.footings.size,
      // No source classifies pedestals before the footing pass runs, so they stay absent until
      // one appears in `membership`. Claiming candidates we cannot count would be the inverse lie.
      pedestal: 0,
    },
  });

  const groups = $derived(rcMemberList(input));
  const hasRows = $derived(rcHasListableMembers(input));
  const hasUnclassified = $derived(rcHasUnclassifiedFamilies(input));

  /** A READ of the one selection channel. Never a copy, never a second source. */
  const selectedIds = $derived(new Set(rebarWorkspace.selection?.elementIds ?? []));

  /**
   * Select a member — objective 3, and the whole of it.
   *
   * `selectAndFocus` was written for this caller and says so: "Select a member from the list AND
   * point the camera at it. One action because they are one intention." A list that selected
   * without moving the camera would leave the user hunting for what they just clicked in a cage
   * of thousands of bars.
   *
   * Keyed on `elementId` and never on the row's position. The ordinal in the label is a reading
   * aid — "Beam 1" is the first beam, not element 1 — and selecting by it would send the viewer
   * to whatever member happened to sort first.
   */
  function selectMember(elementId: number): void {
    rebarWorkspace.selectAndFocus(elementId);
  }

  /**
   * Arrow keys move within a family's rows, and the selection follows focus.
   *
   * That is the single-select listbox convention, and it is what makes the keyboard produce the
   * SAME selection as the mouse rather than a second, quieter one. Enter and Space need no
   * handling — these are real `<button>`s and the browser already fires click for both.
   *
   * Escape clears through the same channel. It does not restore a previous selection: `goBack()`
   * exists for that and is the workspace's own affordance, and having Escape mean two things
   * depending on history is how a shortcut becomes unpredictable.
   */
  function onRowKeydown(e: KeyboardEvent, rows: readonly { elementId: number }[], i: number) {
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (step !== 0) {
      const next = rows[i + step];
      if (!next) return;
      e.preventDefault();
      selectMember(next.elementId);
      // Focus follows the selection, or the next arrow press would start from where it was.
      const el = document.querySelector<HTMLElement>(
        `[data-testid="rc-member-${next.elementId}"]`);
      el?.focus();
      return;
    }
    if (e.key === 'Escape' && rebarWorkspace.selection) {
      e.preventDefault();
      rebarWorkspace.select(null);
    }
  }

  /** The census line a family heading carries, in words rather than only as a number. */
  function censusText(c: RcFamilyCensus): string {
    if (c.state === 'unknown') return t('design.families.census.unknown');
    if (c.state === 'absent') return t('design.families.state.noElements');
    return tp('design.memberList.detailedOf', { n: c.detailed, total: c.total });
  }
</script>

<!--
  A section per group, a heading per family, a row per member.

  Headings are real headings so a screen reader can jump between groups, and the rows are a
  `listbox` because that is what they are: one element is current, arrow keys move between them.
-->
<section class="member-list" data-testid="rc-member-list" aria-label={t('design.memberList.title')}>
  {#if !hasRows}
    <!--
      Nothing to enumerate, and the two reasons for that are different statements.
      `nothingClassified` is a model with candidates nobody has classified; `emptyModel` is a
      model with nothing in it. Collapsing them is the defect the census exists to prevent.
    -->
    <p class="note" data-testid="rc-member-list-empty">
      {hasUnclassified
        ? t('design.memberList.nothingClassified')
        : t('design.memberList.emptyModel')}
    </p>
  {/if}

  {#each groups as g (g.group)}
    {#if g.render}
      <div class="group" data-testid={`rc-group-${g.group}`}>
        <h5 data-testid={`rc-group-label-${g.group}`}>{t(g.labelKey)}</h5>

        {#each g.families as f (f.family)}
          {#if f.census.state !== 'absent'}
            <div class="family" data-testid={`rc-family-${f.family}`}
                 data-state={f.census.state}>
              <p class="family-head">
                <span class="family-name" data-testid={`rc-family-label-${f.family}`}
                  >{t(f.labelKey)}</span>
                <!--
                  The state in WORDS, not only as a number or a colour. "not counted yet" and
                  "no members in this model" are different sentences on purpose.
                -->
                <span class="census" data-testid={`rc-family-census-${f.family}`}
                  >{censusText(f.census)}</span>
              </p>

              {#if f.census.state === 'present'}
                <ul role="listbox" aria-label={t(f.labelKey)}
                    data-testid={`rc-family-rows-${f.family}`}>
                  {#each f.rows as row, i (row.elementId)}
                    <li>
                      <!--
                        A human label first — "Beam 3", the third beam — and the technical id
                        after it, as secondary text. The id is what every other surface keys on,
                        so it is kept rather than hidden; it is just not the name.
                      -->
                      <button
                        type="button"
                        role="option"
                        aria-selected={selectedIds.has(row.elementId)}
                        class:selected={selectedIds.has(row.elementId)}
                        class:undetailed={!row.detailed}
                        data-testid={`rc-member-${row.elementId}`}
                        data-family={row.family}
                        data-detailed={row.detailed}
                        onclick={() => selectMember(row.elementId)}
                        onkeydown={(e) => onRowKeydown(e, f.rows, i)}
                      >
                        <span class="row-label" data-testid={`rc-member-label-${row.elementId}`}
                          >{t(`design.familySingular.${row.family}`)} {i + 1}</span>
                        <code class="row-id" data-testid={`rc-member-id-${row.elementId}`}
                          >{tp('design.memberList.elementId', { id: row.elementId })}</code>
                        {#if !row.detailed}
                          <span class="row-state">{t('design.memberList.undetailed')}</span>
                        {/if}
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  {/each}
</section>

<style>
  .member-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-family: var(--st-sans);
  }
  .note { margin: 0; font-size: 0.72rem; line-height: 1.4; color: var(--st-text-2); }

  .group { display: flex; flex-direction: column; gap: 0.3rem; }
  h5 {
    margin: 0;
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--st-text-3);
  }

  .family { display: flex; flex-direction: column; gap: 0.2rem; }
  .family-head {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 0.5rem;
    margin: 0;
    font-size: 0.72rem;
  }
  .family-name { color: var(--st-text); font-weight: 600; }
  .census { color: var(--st-text-2); }
  /* Waiting on the demand pass, not empty. Amber rather than the dimmed grey `absent` would
     have had — it is a state to act on, and the word beside it says which. */
  .family[data-state='unknown'] .census { color: var(--st-warn); }

  ul { display: flex; flex-direction: column; gap: 0.15rem; margin: 0; padding: 0; list-style: none; }

  /*
    Every control carries a surface and a border of ours. C1 of `pro-panel-consistency` rejects
    one left to the browser to paint, and it is right to: that reads as unstyled rather than as
    deliberately flat.
  */
  button {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.2rem 0.4rem;
    width: 100%;
    padding: 0.15rem 0.35rem;
    border: 1px solid var(--st-hair);
    border-radius: 3px;
    background: var(--st-surface-2);
    color: var(--st-text-2);
    font: inherit;
    font-size: 0.72rem;
    text-align: left;
    cursor: pointer;
  }
  button:hover { background: var(--st-surface-3); }
  button:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
  button.selected {
    border-color: var(--st-interactive);
    background: var(--st-surface-3);
    color: var(--st-text);
  }

  .row-label { font-weight: 600; color: var(--st-text); }
  /* The technical id: monospace, secondary, and never the row's name. */
  .row-id { font-family: var(--st-mono); font-size: 0.66rem; color: var(--st-text-3); }
  .row-state { font-size: 0.66rem; color: var(--st-text-3); }
  button.undetailed .row-label { color: var(--st-text-2); }
</style>
