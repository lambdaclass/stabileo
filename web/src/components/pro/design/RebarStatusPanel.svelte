<script lang="ts">
  /**
   * The model's status, as a thing you can act on.
   *
   * ── Why counts alone are not enough ────────────────────────────────
   *
   * "117 unsupported" tells a reviewer there is a problem and nothing about where. The number
   * has to be a way IN: click the state, get the members in it, click a member, the camera
   * goes there. Everything below exists to make that path two clicks long.
   *
   * ── Nothing here can hide a bad state ──────────────────────────────
   *
   * Every state present in the model has a row, always, including the ones with zero members
   * — no, especially not: a state with no members has no row, because a zero row is noise.
   * But a state WITH members can never be collapsed away or folded into a catch-all. FAILED,
   * UNSUPPORTED, REFUSED, DESIGNED_NOT_MODELLED and NOT_EVALUATED each keep their own row and
   * their own count, because each has a different remedy.
   */
  import { t, tp } from '../../../lib/i18n';
  import { rebarWorkspace } from '../../../lib/store/rebar-workspace.svelte';
  import {
    ELEMENT_STATUS_ORDER, type ElementStatus, type ElementStatusReport,
    type StatusReasonGroup,
  } from '../../../lib/engine/detailing/element-status';

  interface Props {
    report: ElementStatusReport;
    /**
     * Why each member is in the state it is, keyed by member.
     *
     * The state NAME is not an explanation. "UNSUPPORTED" on 117 beams told a reviewer that
     * something was wrong and nothing about what, when the design had already produced a
     * sentence naming the axis and the ratio behind it. Passed in rather than read here so
     * this component stays free of stores.
     */
    reasons?: ReadonlyMap<number, string>;
    /**
     * The shared causes, commonest first.
     *
     * A per-member sentence answers "why is THIS one orange". It does not answer "why are
     * 117 of them orange", and that is the question a reviewer actually opens this panel
     * with. On the 7-storey example the honest answer is one sentence — the verifier does
     * not implement the biaxial check and these beams bend about both axes — and until it
     * was stated once, at the top, the screen was indistinguishable from a viewer that had
     * lost the steel. Each group isolates its members in the viewport on click, so the
     * statement is also a way in.
     */
    reasonGroups?: readonly StatusReasonGroup[];
  }
  const { report, reasons, reasonGroups = [] }: Props = $props();

  /** Groups for one state, in the order `summariseStatusReasons` produced. */
  function groupsFor(s: ElementStatus): readonly StatusReasonGroup[] {
    return reasonGroups.filter((g) => g.status === s);
  }

  /** `0.105` → `11` — the ratio as the percentage the design's own reason line quotes. */
  function pct(r: number): number {
    return Math.round(r * 100);
  }

  /**
   * One sentence for a whole group.
   *
   * Prefers a purpose-written aggregate line, because the per-member reason opens with
   * "Member 86:" and a heading that names one arbitrary member of 117 reads as if the other
   * 116 were something else. Where no aggregate line exists the per-member sentence is used
   * verbatim rather than dropping the group: an imperfect explanation beats a bare count,
   * and `t()` returning the key itself would put a dotted identifier on screen.
   */
  function causeText(g: StatusReasonGroup): string {
    const aggregateKey = `detailing.scene.cause.${g.reasonKey.replace('design.reason.', '')}`;
    const aggregate = t(aggregateKey);
    if (aggregate !== aggregateKey) return aggregate;
    return reasons?.get(g.elementIds[0]) ?? t(`detailing.scene.status.${g.status}`);
  }

  const filtered = $derived.by(() => {
    const f = rebarWorkspace.statusFilter;
    return f.length === 0
      ? report.entries
      : report.entries.filter((e) => f.includes(e.status));
  });

  const selectedIds = $derived(new Set(rebarWorkspace.selection?.elementIds ?? []));

  function rowClass(s: ElementStatus): string {
    return `st-${s.toLowerCase().replace(/_/g, '-')}`;
  }
</script>

<section class="status" data-testid="rebar-status-panel">
  <h4>{t('detailing.scene.status.title')}</h4>
  <p class="hint">{t('detailing.scene.statusFilterHint')}</p>

  <ul class="counts" data-testid="rebar-status-counts">
    {#each ELEMENT_STATUS_ORDER as s (s)}
      {#if report.counts[s] > 0}
        <li>
          <button
            type="button"
            class="count-row {rowClass(s)}"
            class:active={rebarWorkspace.statusFilter.includes(s)}
            data-testid={`rebar-status-${s}`}
            aria-pressed={rebarWorkspace.statusFilter.includes(s)}
            onclick={() => rebarWorkspace.toggleStatus(s)}
          >
            <span class="dot"></span>
            <span class="label">{t(`detailing.scene.status.${s}`)}</span>
            <span class="n">{report.counts[s]}</span>
          </button>
          {#each groupsFor(s) as g (g.reasonKey)}
            <button
              type="button"
              class="cause"
              data-testid={`rebar-status-cause-${s}`}
              data-reason-key={g.reasonKey}
              title={t('detailing.scene.cause.isolate')}
              onclick={() => rebarWorkspace.isolate(g.elementIds)}
            >
              <span class="cause-n">{g.count}</span>
              <span class="cause-text">
                {causeText(g)}
                {#if g.ratioRange}
                  {tp('detailing.scene.cause.ratioRange', {
                    min: pct(g.ratioRange.min), max: pct(g.ratioRange.max),
                  })}
                {/if}
              </span>
            </button>
          {/each}
        </li>
      {/if}
    {/each}
  </ul>

  <!-- ── Top assembly reinforcement ─────────────────────────────────
       Beside the states rather than inside them, because it is not one. A member carrying the
       §25.7.1.2 pair is still whatever the design made it — 62 of the 63 on the 7-storey
       building are proposals and one is verified — so putting it in the state column would
       have to drop one of the two facts. It is a way IN for the same reason every state row
       is: click it and the viewport isolates them. -->
  {#if report.hangerTopMembers.length > 0}
    <button
      type="button"
      class="cause hanger"
      data-testid="rebar-status-hanger-top"
      title={t('detailing.scene.cause.isolate')}
      onclick={() => rebarWorkspace.isolate(report.hangerTopMembers)}
    >
      <span class="cause-n">{report.hangerTopMembers.length}</span>
      <span class="cause-text">{t('detailing.scene.hangerTop')}</span>
    </button>
  {/if}

  {#if rebarWorkspace.statusFilter.length > 0}
    <button type="button" class="link" onclick={() => rebarWorkspace.clearStatusFilter()}>
      {t('detailing.scene.clearIsolation')}
    </button>
  {/if}

  <h5>{t('detailing.scene.elements')} ({filtered.length})</h5>
  {#if filtered.length === 0}
    <p class="hint">{t('detailing.scene.noneOfState')}</p>
  {:else}
    <ul class="elements" data-testid="rebar-element-list">
      {#each filtered as e (e.elementId)}
        <li>
          <button
            type="button"
            class="element {rowClass(e.status)}"
            class:selected={selectedIds.has(e.elementId)}
            data-testid={`rebar-element-${e.elementId}`}
            onclick={() => rebarWorkspace.selectAndFocus(e.elementId)}
          >
            <span class="dot"></span>
            <span class="id">{tp('detailing.scene.solid.member', { id: e.elementId })}</span>
            {#if e.topSteel === 'hangerProvisional'}
              <span
                class="hanger-chip"
                data-testid={`rebar-element-hanger-${e.elementId}`}
                title={t('detailing.scene.hangerTop')}
              >{t('detailing.scene.hangerTopShort')}</span>
            {/if}
            <span class="st">{t(`detailing.scene.status.${e.status}`)}</span>
          </button>
          {#if reasons?.get(e.elementId) && selectedIds.has(e.elementId)}
            <p class="reason">{reasons.get(e.elementId)}</p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  /* No `min-height: 0` here. It dated from the member list having its own scroller, and
     with that gone it only meant this section could be crushed out of existence by a
     rail one row too short — which is exactly what happened. The rail scrolls; see the
     `.rail > *` rule in `RebarWorkspace.svelte`. */
  .status { display: flex; flex-direction: column; gap: 0.45rem; }
  h4, h5 { margin: 0; font-size: 0.82rem; }
  .hint { margin: 0; font-size: 0.72rem; color: var(--st-text-2); }
  ul { list-style: none; margin: 0; padding: 0; }
  .counts { display: flex; flex-direction: column; gap: 0.15rem; }
  .count-row, .element {
    display: flex; align-items: center; gap: 0.4rem; width: 100%;
    background: transparent; border: 1px solid transparent; border-radius: 4px;
    padding: 0.22rem 0.4rem; cursor: pointer; text-align: left;
    color: inherit; font-size: 0.76rem;
  }
  /* `--st-surface-3` is the token whose stated job is "inputs, wells, hover states". */
  .count-row:hover, .element:hover { background: var(--st-surface-3); }
  .count-row.active { border-color: currentColor; }
  .element.selected { background: rgba(255, 212, 0, 0.16); border-color: #ffd400; }
  .label, .id { flex: 1 1 auto; }
  .n, .st { font-variant-numeric: tabular-nums; opacity: 0.85; }
  .dot { width: 0.55rem; height: 0.55rem; border-radius: 50%; flex: 0 0 auto; }
  /*
     One colour per state, and never two states sharing one.
     ─────────────────────────────────────────────────────────────────────
     These seven stay LITERAL, deliberately, and `viewer-design-system.test.ts` already says
     so: "leaves the state colours alone, because Three.js owns them". Four of them are
     mirrored BY VALUE in `three/rebar-scene.ts` — `0xe0444a` conflicted, `0xd4762a`
     unreinforced, `0xa066d3` provisional, `0xffd400` selected — and a material cannot read a
     custom property, so aliasing the CSS copies would let the picture and the words beside it
     drift apart. That is the one thing the colour exists to prevent.

     The other three have no token to go to. `--st-warn` and `--st-danger` are the only two
     status hues in `tokens.css`, and `--st-danger` is already spoken for by `failed`; sending
     `unsupported`, `designed-not-modelled` and `refused` there would merge states that are
     distinct. So the palette is frozen whole rather than tokenised by halves — see the
     ceiling entry in `concrete-design-raw-colours.test.ts`.
  */
  .st-failed .dot { background: #e0444a; }
  .st-unsupported .dot { background: #b06ad6; }
  /* The same violet the 3-D view paints provisional steel with — one colour, one meaning,
     across the panel and the viewport. */
  .st-provisional .dot { background: #a066d3; }

  /* Assembly steel reads as a note, not as a state: it borrows the cause row's weight and
     stays off the state palette, so no reader takes it for one of the seven. */
  .cause.hanger { display: flex; width: 100%; }
  .hanger-chip {
    font-size: 0.68rem; padding: 0 0.28rem; border-radius: 3px;
    border: 1px solid var(--st-hair-strong); color: var(--st-text-2); white-space: nowrap;
  }
  .st-refused .dot { background: #d4762a; }
  .st-designed-not-modelled .dot { background: #d9c04a; }
  .st-not-evaluated .dot { background: #8b93a3; }
  .st-modelled .dot { background: #4caf72; }
  /**
   * The member list does NOT scroll on its own.
   *
   * It used to, inside a rail that also scrolls. Two nested scrollers meant the browser could
   * bring a row into view within the inner list while the list itself sat below the rail's
   * visible area — the row was "visible, enabled and stable" and still unreachable, which is
   * what happened the moment the tally and the piece breakdown grew the rail above it.
   *
   * One scroller, the rail's, and every row is reachable by scrolling the thing the user is
   * already scrolling.
   */
  .elements { flex: 0 0 auto; }
  .reason {
    margin: 0 0 0.25rem 1.4rem; font-size: 0.7rem;
    color: var(--st-text-2);
  }
  /* The shared cause sits UNDER its state row and indented to it, so it reads as an
     explanation of that count rather than as another state. */
  .cause {
    display: flex; align-items: baseline; gap: 0.35rem; width: 100%;
    margin: 0 0 0.2rem 1.4rem; padding: 0.1rem 0.3rem;
    /* `--st-hair-strong`, not `var(--st-border, #2c3444)`.
       `viewer-design-system.test.ts` requires a fallback on every `--text` / `--text-muted` /
       `--st-border` / `--panel` call in a viewer panel, so a bypassed overlay degrades instead
       of going unreadable. `.workspace` aliases `--st-border: var(--st-hair-strong)`, so this
       is the value that renders today either way — and naming it directly satisfies that
       contract outright rather than insuring against it, because `--st-hair-strong` is on
       `:root` and cannot fail to resolve. Same for `.hanger-chip` above. */
    background: none; border: none; border-left: 2px solid var(--st-hair-strong);
    color: var(--st-text-2); font-size: 0.7rem; line-height: 1.35;
    text-align: left; cursor: pointer;
  }
  /* `--st-interactive` — "you can click this" — not `--st-focus`, which is the ring. */
  .cause:hover { color: var(--st-text); border-left-color: var(--st-interactive); }
  .cause-n { flex: none; font-variant-numeric: tabular-nums; font-weight: 600; }
  .cause-text { min-width: 0; }
  .link {
    background: none; border: none; padding: 0; color: var(--st-interactive);
    font-size: 0.74rem; cursor: pointer; text-align: left;
  }
</style>
