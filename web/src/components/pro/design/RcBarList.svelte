<script lang="ts">
  /**
   * The assembly's bars, named the way a person names them, with the state each one is in.
   *
   * ── Why this is its own component ──────────────────────────────────
   *
   * `DetailingWorkflow.svelte` was at 509 lines against the 600 the gate enforces, and objective 5
   * adds a census, a badge, a reason line and their styles. §9.5 already decided the outcome:
   * if it grows, it becomes a component mounted ONCE, as `RcMemberList` was. Mounted once matters
   * — a second mount is a second `markOf` map and a second opinion about how many bars are
   * unmarked.
   *
   * ── What it renders, and what it refuses to decide ─────────────────
   *
   * The naming is `rc-bar-label.ts`'s and the state is `rc-bar-status.ts`'s. Nothing here decides
   * what a bar is called or whether it is provisional; it reads both and lays them out. That
   * split is the point: the assertion that the primary label is never an engine key is a unit
   * test over a pure function, and it stays true only while the component has no second way to
   * produce a label.
   *
   * The three states come from two axes on purpose — see `rc-bar-status.ts`. The row shows the
   * badge AND keeps the mark, so "provisional" never costs a bender the tag they fabricate from.
   *
   * ── Accessibility ──────────────────────────────────────────────────
   *
   * The badge carries a glyph and a word, so a reader who cannot tell violet from grey still
   * reads the state — the same rule `DetailingProblems` passes for severity. The provisional
   * REASON is rendered as text on the row rather than living in a `title`: a tooltip is not
   * reachable by keyboard and is not read by every screen reader, and the reason is the part
   * that tells a reviewer which of the two proposals they are looking at.
   *
   * The list is STILL not a listbox after objective 6, and that is a decision rather than an
   * omission. Pinning a bar is not selecting it: nothing else in the app follows the pinned bar,
   * there is no "current bar", and `rebarWorkspace.selection` — the one selection channel, per
   * §9.2 — is not written from here and must not be. A `role="option"` would announce a
   * selection that does not exist, and a second channel that held one would be the exact defect
   * `rc-selection.ts` was written to close.
   *
   * A roving tabindex over the lock buttons was considered and rejected for the same reason it
   * is RIGHT in `RcMemberList`: there the rows are a listbox and arrow keys are the announced
   * idiom, so one tab stop costs nothing. Here they are independent toggle buttons with no
   * composite role to announce, so a roving tabindex would put 199 of 200 controls behind a
   * gesture nothing tells the user about. Native tab stops it is; the list is inside a
   * `<details>` that is closed until asked for, which is what bounds the cost.
   */
  import { t, tp } from '../../../lib/i18n';
  import { rcBarLabel, rcBarLabelParts } from '../../../lib/flow/rc-bar-label';
  import { rcBarStatus, rcBarStateCounts } from '../../../lib/flow/rc-bar-status';
  import { rcBarLock, rcBarLockCensus, rcHasPins } from '../../../lib/flow/rc-bar-lock';
  import type { BarPath } from '../../../lib/codes/cirsoc201/bar-geometry';

  interface Props {
    bars: readonly BarPath[];
    /** Bar id → drawing mark. The caller builds it from `assignMarks`' output. */
    markOf: ReadonlyMap<string, string>;
    /**
     * `DetailingAssembly.provisionalMembers` — members whose OWN design is a proposal.
     *
     * The assembly's field, not a set derived from bar ownership. `scene-model.ts` records what
     * inferring it costs: 202 members counted against 117 provisional beams.
     */
    provisionalMembers: ReadonlySet<number>;
    onToggleLock: (barId: string) => void;
  }
  const { bars, markOf, provisionalMembers, onToggleLock }: Props = $props();

  /** One pass over the bars, so the census and the rows cannot disagree about a single one. */
  const rows = $derived(bars.map((bar) => {
    const label = rcBarLabel(bar, (id) => markOf.get(id));
    const status = rcBarStatus(bar, (id) => markOf.get(id), provisionalMembers);
    return {
      bar,
      label,
      parts: rcBarLabelParts(label),
      status,
      /*
        The pin, and how far it reaches.

        `provisional` is handed over from the status rather than recomputed: `rc-bar-lock.ts`
        must not own a second definition of provenance, for the reason `rc-bar-status.ts`
        spends its header on.
      */
      lock: rcBarLock(bar, { provisional: status.state === 'provisional' }),
    };
  }));

  const counts = $derived(rcBarStateCounts(rows.map((r) => r.status)));
  const pins = $derived(rcBarLockCensus(rows.map((r) => r.lock)));

  /** Glyph per state. Redundant with the word on purpose: neither is load-bearing alone. */
  const GLYPH = { provisional: '◆', marked: '●', unmarked: '○' } as const;
</script>

<details class="bars" data-testid="bar-list">
  <!--
    The count first, because three specs read it, and the census after it, because a reviewer
    deciding whether to open the list wants to know what is in it before they do.
  -->
  <summary>
    {tp('detailing.barsCount', { n: bars.length })}
    {#if counts.total > 0}
      <span class="census" data-testid="barcensus">
        {#if counts.provisional > 0}
          <span class="chip st-provisional">
            {GLYPH.provisional} {tp('detailing.bar.census.provisional', { n: counts.provisional })}
          </span>
        {/if}
        {#if counts.unmarked > 0}
          <span class="chip st-unmarked">
            {GLYPH.unmarked} {tp('detailing.bar.census.unmarked', { n: counts.unmarked })}
          </span>
        {/if}
        {#if counts.marked > 0}
          <span class="chip st-marked">
            {GLYPH.marked} {tp('detailing.bar.census.marked', { n: counts.marked })}
          </span>
        {/if}
      </span>
    {/if}
  </summary>

  <!--
    What the pins add up to, announced when it changes.

    `aria-pressed` flipping is announced by itself, and it says nothing about the CONSEQUENCE:
    that this pin froze the design of two members, one of which the user was not looking at.
    That sentence is on the row, and a row that is already rendered is not re-read. A polite
    live region is the one place a keyboard-only reader is told what their press did.

    Rendered as an empty region rather than conditionally mounted: a live region created at the
    moment its content appears is not reliably announced, because assistive technology has to
    have been watching it beforehand.
  -->
  <!--
    The summary counts MEMBERS, because that is what a lock is a lock on.

    Counting the flagged BARS would read "14 locked" after one press on a beam with fourteen
    bars, while the viewer and every export count that as one locked member — and "no crear una
    semántica distinta entre lista, visor y exportaciones" is the decision. `rcBarLockCensus`
    still carries the bar count; nothing leads with it.
  -->
  <p class="pins" data-testid="bar-pins" aria-live="polite">
    {#if rcHasPins(pins)}
      <span class="chip st-pinned" data-testid="bar-pins-count">
        <span aria-hidden="true">⬤</span>
        {tp('detailing.bar.census.pinned', { n: pins.frozenMembers.length })}
      </span>
      <span class="frozen" data-testid="bar-pins-frozen">
        {tp('detailing.bar.lock.frozenMembers', {
          n: pins.frozenMembers.length,
          ids: pins.frozenMembers.join(', '),
        })}
      </span>
      {#if pins.pinnedProvisional > 0}
        <span class="frozen-prov" data-testid="bar-pins-provisional">
          {tp('detailing.bar.lock.pinnedProvisional', { n: pins.pinnedProvisional })}
        </span>
      {/if}
    {/if}
  </p>

  <ul class="barlist">
    {#each rows as { bar, label, parts, status, lock } (bar.id)}
      <li
        data-testid={`bar-${bar.id}`}
        data-bar-state={status.state}
        data-bar-lock={lock.state}
        class:locked={lock.locked}
        class:provisional={status.state === 'provisional'}
      >
        <span class="bar-mark" data-testid={`bar-mark-${bar.id}`}>{parts.lead}</span>

        <!--
          The state, as a glyph and a word.

          `data-bar-state` on the row is what a test and a stylesheet both key on, so neither has
          to parse the label to find out what the row is.
        -->
        <span
          class="bar-state st-{status.state}"
          data-testid={`barstate-${bar.id}`}
        >
          <span aria-hidden="true">{GLYPH[status.state]}</span> {t(status.stateKey)}
        </span>

        <span class="bar-dia">Ø{bar.diameterMm}</span>
        <span class="bar-len">{bar.cuttingLength.toFixed(2)} m</span>
        <span class="bar-role">{t(`detailing.barRole.${bar.role}`)}</span>

        <!-- Secondary, and selectable: the exact key, for whoever is reconciling a record. -->
        <code class="bar-id" data-testid={`bar-id-${bar.id}`}
              title={t('detailing.bar.technicalId')}>{label.technicalId}</code>

        <!--
          The pin, as a state and as an action.

          `data-testid` is per bar. It was the literal `bar-lock` on every row, so a suite could
          only ever reach `.first()` — which is how D21 was written — and no test could assert
          that a pin landed on the bar it was pressed for. `barlock-` and not `bar-lock-`, per
          §9.4: the row is `bar-${id}` and a child prefixed `bar-` puts every `^=` selector in
          the list one index out. `barstate-` and `barnote-` were named that way for the same
          reason.

          The accessible name carries the bar's own label. Two hundred buttons all announcing
          `Fijar, botón` name nothing; `Fijar la barra B12` names the row the way the row names
          itself.
        -->
        <button
          type="button"
          data-testid={`barlock-${bar.id}`}
          class="lock"
          class:on={lock.locked}
          aria-pressed={lock.locked}
          aria-label={tp(lock.actionLabelKey, { name: parts.lead })}
          onclick={() => onToggleLock(bar.id)}
        >
          <span aria-hidden="true">{lock.glyph}</span> {t(lock.actionKey)}
        </button>

        <!--
          What the pin froze, in words, on its own line.

          A pin is consumed at two granularities — `runDetailing` takes the BAR, the repair loop
          takes every member the bar owns — so pinning one bar continuous over a support stops
          the loop repairing a column the user never opened. `rc-bar-lock.ts` computes that
          reach the same way `lockedMemberIds()` builds the set the loop receives, so the
          sentence and the engine cannot disagree.
        -->
        {#if lock.freezesKey}
          <p class="lock-note" class:reaches={lock.reaches}
             data-testid={`barlocknote-${bar.id}`}>
            {tp(lock.freezesKey, {
              n: lock.frozenMembers.length,
              ids: lock.frozenMembers.join(', '),
            })}
            {#if lock.pinnedProvisional}
              <span class="prov-pin">{t('detailing.bar.lock.pinOnProposal')}</span>
            {/if}
          </p>
        {/if}

        <!--
          Why it is provisional, in words, on its own line.

          Two different proposals reach this row — the bar is one, or it runs through a member
          that is one — and they are resolved differently. A reviewer who cannot tell them apart
          goes looking in the wrong place.
        -->
        {#if status.reasonKey}
          <p class="bar-note" data-testid={`barnote-${bar.id}`}>
            {t(status.reasonKey)}
            {#if status.provisionalOwners.length > 0}
              <span class="owners">
                {tp('detailing.bar.provisional.owners', {
                  ids: status.provisionalOwners.join(', '),
                })}
              </span>
            {/if}
          </p>
        {/if}
      </li>
    {/each}
  </ul>
</details>

<style>
  details.bars { margin: 0.5rem 0; }
  details.bars summary { cursor: pointer; font-size: 0.8rem; }

  .census { display: inline-flex; flex-wrap: wrap; gap: 0.25rem; margin-left: 0.35rem; }
  .chip {
    font-size: 0.66rem;
    font-weight: 600;
    padding: 0 0.35rem;
    border-radius: 3px;
    background: var(--st-surface-3);
  }

  ul.barlist { list-style: none; margin: 0.3rem 0 0; padding: 0; max-height: 16rem; overflow: auto; }
  ul.barlist > li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    font-size: 0.76rem;
    padding: 0.15rem 0;
    border-top: 1px solid var(--st-hair);
  }
  /*
    A pinned row: a tint and a rule, never an opaque fill.

    It was `background: var(--st-blue)` — the PLAIN hue, opaque, under 0.76rem body text.
    `tokens.css` states what the plain hues are for: "fills, rules and figures, where area
    carries the meaning", and `DetailingWorkflow`'s `.superseded` chip already records what
    happens when one is used as a text ground — 3.69 against AA's 4.5. The row also carried
    `--st-text` and a monospace id at `--st-text-3`, which on that blue is worse still.

    So the same form the provisional row directly above uses: `-bg` tint plus a 2 px rule in the
    plain hue on the leading edge. One shape for "this row is in a state", two hues for which
    state, and a row that is BOTH pinned and provisional keeps both — the violet rule, because
    provisional is the more urgent fact and wins the edge, and the blue tint underneath it.
  */
  ul.barlist > li.locked {
    background: var(--st-pinned-bg);
    border-left: 2px solid var(--st-blue);
    padding-left: 0.35rem;
  }
  /*
    The violet is `--st-provisional`, and it is the SAME violet the 3-D view paints provisional
    steel with and the workspace banner borders itself with. One colour, one meaning — a fourth
    shade for the same fact is how a reader learns to distrust all of them.

    A tint plus a rule rather than an opaque fill, for the reason the `.superseded` chip in
    `DetailingWorkflow` records: `--st-text` on an opaque accent measures under AA at this size.
  */
  ul.barlist > li.provisional {
    background: var(--st-provisional-bg);
    border-left: 2px solid var(--st-provisional);
    padding-left: 0.35rem;
  }

  /* The mark leads: same weight as the rest of the row, first in reading order. */
  .bar-mark { min-width: 3rem; font-weight: 600; }

  .bar-state { font-size: 0.68rem; font-weight: 600; white-space: nowrap; }
  .st-provisional { color: var(--st-provisional-text); }
  .st-unmarked { color: var(--st-warn); }
  /* Marked is the ordinary case, so it is stated without being emphasised. */
  .st-marked { color: var(--st-text-2); }

  /*
   * The id, one level down. Smaller and dimmer, and `--st-text-3` is the token reserved for
   * exactly this — text that is present for reference rather than for reading.
   */
  .bar-id {
    font-family: monospace;
    font-size: 0.68rem;
    color: var(--st-text-3);
    user-select: all;
  }
  .bar-dia, .bar-len { min-width: 4rem; }
  .bar-role { flex: 1; opacity: 0.8; }

  /*
    The pin control.

    A surface and a border of ours, because C1 of `pro-panel-consistency` rejects a control left
    to the browser to paint — this one had neither and read as unstyled. The focus ring is
    explicit for the same reason `RcMemberList`'s is: the UA default outline on this surface is
    the one a keyboard user cannot find.

    Pressed is a border and a text colour, not a fill: `--st-blue` as a 0.7rem ground is the
    contrast failure the row rule above documents, and `--st-blue-text` is 5.36 on ink.
  */
  .lock {
    display: inline-flex;
    align-items: baseline;
    gap: 0.2rem;
    font: inherit;
    font-size: 0.7rem;
    padding: 0.05rem 0.35rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    background: var(--st-surface-2);
    color: var(--st-text-2);
    cursor: pointer;
  }
  .lock:hover { background: var(--st-surface-3); color: var(--st-text); }
  .lock:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
  .lock.on {
    border-color: var(--st-blue-text);
    color: var(--st-blue-text);
    font-weight: 600;
  }

  /* What the pin froze. Full row, read as a sentence — the same shape as `.bar-note`. */
  .lock-note {
    flex-basis: 100%;
    margin: 0 0 0.15rem;
    font-size: 0.68rem;
    color: var(--st-text-2);
  }
  /* A pin that reaches past its own member is the fact the line exists for. */
  .lock-note.reaches { color: var(--st-warn); }
  .prov-pin { color: var(--st-provisional-text); }

  /* The pin summary, on the same footing as the state census above it. */
  .pins {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.4rem;
    margin: 0.25rem 0 0;
    font-size: 0.68rem;
    color: var(--st-text-2);
  }
  .pins:empty { margin: 0; }
  .st-pinned { color: var(--st-blue-text); }
  .frozen { color: var(--st-text-2); }
  .frozen-prov { color: var(--st-provisional-text); }

  /* The reason takes the full row so it is read as a sentence, not as another column. */
  .bar-note {
    flex-basis: 100%;
    margin: 0 0 0.15rem;
    font-size: 0.68rem;
    color: var(--st-text-2);
  }
  .owners { color: var(--st-text-3); }
</style>
