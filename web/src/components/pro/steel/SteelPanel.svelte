<script lang="ts">
  /**
   * Estructuras metálicas — the inventory, and an honest account of what was not done.
   *
   * ── What this screen is ────────────────────────────────────────────
   *
   * It answers "what steel is in my model, and what has happened to it". Both halves
   * matter. Before this, the first question had no surface at all and the second had two
   * misleading ones: the RC design table listed steel members and refused them as
   * "demand unavailable" with demands sitting right there, and the CIRSOC 301 table put a
   * green tick beside numbers from an untested checker.
   *
   * ── What it must never become ──────────────────────────────────────
   *
   * A verification screen. It renders no utilization, no capacity and no pass. The banner
   * at the top says so in words rather than leaving it to be inferred from an absence, and
   * `steelCountsAsVerified` guarantees in the type system that no status reaching it can be
   * treated as one.
   *
   * ── Empty is a result, not a blank ─────────────────────────────────
   *
   * Three different situations produce no rows, and the panel names which one it is. A user
   * whose steel is missing because nothing declares a strength needs to hear that, not to
   * stare at an empty table wondering whether the feature works.
   */
  import { t, tp } from '../../../lib/i18n';
  import { steelStore } from '../../../lib/store/steel.svelte';
  import { regulationsStore } from '../../../lib/store/regulations.svelte';
  import { bindingLabel } from '../../../lib/codes/roles';
  import { maturityLabelKey } from '../../../lib/codes/maturity';
  import { formatClause } from '../../../lib/codes/regulation';
  import { te } from '../../../lib/i18n/engine-text';
  import { STRUCTURAL_MATERIAL_FAMILIES } from '../../../lib/engine/steel/material-family';
  import { structuralGradeSource } from '../../../lib/grades/catalogue';
  import SteelStatusBadge from './SteelStatusBadge.svelte';
  import ColdFormedPanel from './ColdFormedPanel.svelte';

  const inv = $derived(steelStore.inventory);
  const kinds = $derived(steelStore.countByKind);

  const steelBinding = $derived(regulationsStore.binding('steel'));
  const codeLabel = $derived(steelBinding.adapterId ? te(bindingLabel(steelBinding)) : null);

  /** Families actually present, so the census does not print eleven zeroes. */
  const censusRows = $derived(
    STRUCTURAL_MATERIAL_FAMILIES
      .map((f) => ({ family: f, n: inv.census.byFamily[f] }))
      .filter((r) => r.n > 0),
  );

  /**
   * The grade behind a member, resolved for display.
   *
   * The inventory carries the id and nothing else, because it is pure. Resolution happens here,
   * which also means a stored id the catalogue no longer knows shows as unresolved rather than
   * as a blank — a project saved against a withdrawn grade should say so.
   */
  function gradeOf(gradeId: string | undefined) {
    if (!gradeId) return null;
    const g = structuralGradeSource.byId(gradeId);
    return g ? { designation: g.designation, standard: g.productStandard } : null;
  }

  const emptyMessage = $derived(
    inv.emptyReason
      ? tp(`steel.panel.empty.${inv.emptyReason}`, { total: inv.census.total })
      : '',
  );
</script>

<div class="steel-panel" data-testid="pro-steel-panel">
  <!--
    The banner is first and is not dismissible. Every other statement on this screen is
    conditioned by it, and a warning a user can close is a warning that will be absent from
    the screenshot that reaches somebody else.
  -->
  <div class="banner" role="note" data-testid="steel-experimental-banner">
    <span class="banner-tag" aria-hidden="true">⚗</span>
    <p>{t('steel.panel.experimentalBanner')}</p>
  </div>

  <header class="head">
    <h3>{t('steel.panel.title')}</h3>
    <p class="sub">{t('steel.panel.subtitle')}</p>
  </header>

  <!--
    Which code, which EDITION, and how mature the app's support for it is.

    The edition was the piece missing. A project can declare CIRSOC 301 and the panel said so, but
    not which text — and `roles.ts` offers 2018 for steel while the concrete role carries both a
    2005 and a 2025, so an edition is a real choice the reader could not see. Both fields are on
    the binding already (`RoleBinding.edition`, `.maturity`), copied there at bind time precisely
    so a stored project stays readable, so this is a read and not a new contract.

    The catalogue's own `noteKey` — the sentence that says the official text ships with the app and
    what is missing is the adapter — is NOT on the binding and there is no exported lookup by
    `adapterId`. Adding one means editing `lib/codes/roles.ts`, which is the shared regulation
    catalogue. Reported for coordination rather than edited; see `m1-m2-scope-split.md` §3.
  -->
  <section class="code-line" data-testid="steel-code-line">
    {#if codeLabel}
      <span>{tp('steel.panel.codeDeclared', { name: codeLabel })}</span>
      {#if steelBinding.edition}
        <span class="edition" data-testid="steel-code-edition"
          >{tp('steel.panel.codeEdition', { edition: steelBinding.edition })}</span>
      {/if}
      <!--
        The maturity of the SUPPORT, which is a different fact from the state of the binding.
        `UNSUPPORTED` with the code declared is the honest resting state of every steel project
        here: the declaration is recorded and nothing is computed from it.
      -->
      <span class="maturity" data-testid="steel-code-maturity"
        >{t(maturityLabelKey(steelBinding.maturity))}</span>
      {#if !steelStore.steelCodeUsable}
        <span class="tag" data-testid="steel-code-experimental">{t('steel.panel.codeExperimental')}</span>
      {/if}
    {:else}
      <span class="muted">{t('steel.panel.codeNotDeclared')}</span>
    {/if}
  </section>

  {#if inv.notices.length > 0}
    <ul class="notices" data-testid="steel-notices">
      {#each inv.notices as key (key)}
        <li>{t(key)}</li>
      {/each}
    </ul>
  {/if}

  {#if steelStore.isEmpty}
    <div class="empty" data-testid="steel-empty">
      <p>{emptyMessage}</p>
      {#if censusRows.length > 0}
        <p class="census-title">{t('steel.panel.censusTitle')}</p>
        <ul class="census" data-testid="steel-census">
          {#each censusRows as row (row.family)}
            <li><span>{t(`steel.family.${row.family}`)}</span><span class="num">{row.n}</span></li>
          {/each}
        </ul>
      {/if}
    </div>
  {:else}
    <p class="summary" data-testid="steel-summary">
      {tp('steel.panel.summary', {
        n: inv.members.length,
        beams: kinds.beam,
        columns: kinds.column,
        length: steelStore.totalLengthM.toFixed(1),
      })}
    </p>

    {#if steelStore.anyInferred}
      <p class="inferred" data-testid="steel-inferred-warning">{t('steel.panel.inferredWarning')}</p>
    {/if}

    <div class="table-wrap">
      <table data-testid="steel-member-table">
        <thead>
          <tr>
            <th scope="col">{t('steel.table.element')}</th>
            <th scope="col">{t('steel.table.kind')}</th>
            <th scope="col">{t('steel.table.section')}</th>
            <th scope="col">{t('steel.table.material')}</th>
            <th scope="col">{t('steel.table.grade')}</th>
            <th scope="col" class="num">{t('steel.table.length')}</th>
            <th scope="col">{t('steel.table.status')}</th>
          </tr>
        </thead>
        <tbody>
          {#each inv.members as m (m.elementId)}
            <tr data-testid={`steel-row-${m.elementId}`}>
              <td>{m.elementId}</td>
              <td>{t(`steel.kind.${m.memberKind}`)}</td>
              <td>{m.sectionName}</td>
              <td>{m.materialName}</td>
              <!--
                The declared grade, with the standard that defines it.

                Two standards can give the same designation to different steels, so a
                designation on its own is not a specification. Where the project declared
                nothing the cell says which of the two reasons applies — no grade recorded, or
                a grade the catalogue no longer knows — instead of being empty.
              -->
              <td data-testid={`steel-grade-${m.elementId}`}>
                {#if gradeOf(m.gradeId)}
                  {@const g = gradeOf(m.gradeId)!}
                  <span class="grade-name">{g.designation}</span>
                  <span class="grade-std">{g.standard}</span>
                {:else if m.gradeId}
                  <span class="grade-unknown" title={m.gradeId}>{t('steel.table.gradeUnresolved')}</span>
                {:else}
                  <span class="grade-none">{t('steel.table.gradeNone')}</span>
                {/if}
              </td>
              <td class="num">{m.lengthM.toFixed(2)}</td>
              <td><SteelStatusBadge status={m.state.status} /></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <!--
    The gap list is always rendered, with or without members. A user deciding whether to
    model their hall in this app needs to see it before they have modelled anything.
  -->
  <details class="gaps" data-testid="steel-gaps">
    <summary>{t('steel.panel.gapsTitle')} <span class="count">{steelStore.capabilityGaps.length}</span></summary>
    <p class="gaps-intro">{t('steel.panel.gapsIntro')}</p>
    <ul>
      {#each steelStore.capabilityGaps as gap (gap.key)}
        <li>
          <strong>{t(`steel.capability.${gap.key}`)}</strong>
          {#if gap.limitation}<span class="limitation">{gap.limitation}</span>{/if}
          {#if gap.refs.length > 0}
            <span class="refs">{gap.refs.map(formatClause).join(' · ')}</span>
          {/if}
        </li>
      {/each}
    </ul>
  </details>

  <!--
    The cold-formed selector.

    Mounted here rather than as a new PRO tab on purpose: `ProPanel.svelte` is the shared tab host
    — it carries the concrete tabs too — and this is the metallic surface. A cold-formed section is
    steel, so the place a user looks for it is the steel screen.

    It is the one part of this panel that CREATES something rather than reporting on the model.
    That does not make it a design surface: what it produces is geometry, and the five facts it
    renders at the top say so before a user can add anything.
  -->
  <ColdFormedPanel />
</div>

<style>
  .steel-panel {
    display: flex; flex-direction: column; gap: 10px;
    padding: 10px 12px; height: 100%; overflow-y: auto;
  }
  .banner {
    display: flex; gap: 8px; align-items: flex-start;
    padding: 8px 10px; border-radius: 4px;
    border: 1px solid var(--st-warn);
    background: repeating-linear-gradient(45deg,
      rgba(221, 170, 0, 0.14) 0 6px, rgba(120, 92, 0, 0.14) 6px 12px);
    color: var(--st-warn);
  }
  .banner p { margin: 0; font-size: 0.72rem; line-height: 1.45; }
  .banner-tag { font-size: 0.95rem; line-height: 1.2; }
  .head h3 { margin: 0; font-size: 0.86rem; font-weight: 600; }
  .sub { margin: 2px 0 0; font-size: 0.7rem; color: var(--st-text-2); }
  .code-line { display: flex; gap: 6px; align-items: center; font-size: 0.72rem; }
  .tag {
    font-size: 0.64rem; font-weight: 600; padding: 1px 5px; border-radius: 3px;
    background: var(--st-surface-3); color: var(--st-text);
  }
  .muted { color: var(--st-text-3); }
  .notices { margin: 0; padding-left: 16px; font-size: 0.7rem; color: var(--st-text-2); }
  .notices li { margin-bottom: 3px; line-height: 1.4; }
  .empty { padding: 12px; border: 1px dashed var(--st-hair); border-radius: 4px; }
  .empty p { margin: 0 0 6px; font-size: 0.74rem; color: var(--st-text-2); }
  .census-title { font-weight: 600; }
  .census { list-style: none; margin: 0; padding: 0; font-size: 0.72rem; }
  .census li { display: flex; justify-content: space-between; padding: 1px 0; color: var(--st-text-2); }
  .summary { margin: 0; font-size: 0.74rem; color: var(--st-text); }
  .inferred { margin: 0; font-size: 0.68rem; color: var(--st-warn); }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.7rem; }
  th, td { text-align: left; padding: 3px 6px; border-bottom: 1px solid var(--st-surface-3); }
  th { color: var(--st-text-2); font-weight: 600; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .gaps { border-top: 1px solid var(--st-surface-3); padding-top: 6px; }
  .gaps summary { cursor: pointer; font-size: 0.74rem; font-weight: 600; }
  .gaps summary:focus-visible { outline: 2px solid var(--st-interactive); outline-offset: 2px; }
  .count {
    font-size: 0.66rem; font-weight: 600; padding: 0 5px; border-radius: 3px;
    background: rgba(128, 128, 128, 0.3);
  }
  .gaps-intro { margin: 6px 0; font-size: 0.68rem; color: var(--st-text-2); }
  .gaps ul { margin: 0; padding-left: 16px; font-size: 0.68rem; }
  .gaps li { margin-bottom: 5px; line-height: 1.4; }
  .gaps strong { display: block; color: var(--st-text); font-weight: 600; }
  .limitation { color: var(--st-text-2); }
  .refs { display: block; color: var(--st-text-3); font-family: monospace; font-size: 0.64rem; }

  /*
    One focus ring for every control in this panel.

    The metallic surface was written before the `--st-*` system reached it: it carried its own
    palette of seventeen hardcoded hex values and, between the two panels, four `:focus-visible`
    rules for several dozen controls. A keyboard user got whatever the UA happened to draw.
  */
  button:focus-visible,
  input:focus-visible,
  select:focus-visible,
  summary:focus-visible,
  [tabindex]:focus-visible {
    outline: 2px solid var(--st-value);
    outline-offset: 1px;
  }
  /* The grade cell holds two facts, so it stacks them rather than running them together. */
  .grade-name { font-family: var(--st-mono, monospace); }
  .grade-std { display: block; font-size: 0.58rem; color: var(--st-text-3); }
  .grade-none, .grade-unknown { color: var(--st-text-3); font-size: 0.6rem; }
  .grade-unknown { border-bottom: 1px dotted var(--st-warn); }
  /* The edition and the maturity sit beside the name, quieter than it: they qualify the
     declaration rather than being the declaration. */
  .edition { font-size: 0.64rem; color: var(--st-text-2); }
  .maturity { font-size: 0.6rem; color: var(--st-text-3); text-transform: uppercase; letter-spacing: 0.04em; }
</style>
