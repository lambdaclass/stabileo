<script lang="ts">
  /**
   * Project regulations — one selector per ROLE, no hardcoded code families.
   *
   * Replaces the CIRSOC-specific panel that had three edition dropdowns, omitted CIRSOC
   * 103 and 301 entirely, and owned the maximum aggregate size. Here every role is a row:
   * selector, edition, maturity badge, applied/pending/stale state, jurisdiction, advanced
   * settings, and an explanation of what changing it invalidates.
   *
   * The panel never applies a load-affecting change itself. It asks, and routes the user
   * to Loads where the before/after preview lives.
   */
  import { t, tp } from '../../../lib/i18n';
  import { te } from '../../../lib/i18n/engine-text';
  import { regulationsStore } from '../../../lib/store/regulations.svelte';
  import { uiStore } from '../../../lib/store/ui.svelte';
  import {
    REGULATION_ROLES, isLoadAffecting, optionLabel, optionsForRole,
    allOptionsForRole, availabilityOf, optionIsAvailable,
    type RegulationRole, type RoleBinding,
  } from '../../../lib/codes/roles';
  import { consequenceOf } from '../../../lib/codes/revisions';
  import { maturityLabelKey } from '../../../lib/codes/maturity';

  /**
   * Catalogued editions that cannot be applied, across every role.
   *
   * Derived from the catalogue rather than listed here, so a regulation whose availability
   * changes needs no edit to this component.
   */
  const reservedOptions = $derived(
    REGULATION_ROLES.flatMap((r) => allOptionsForRole(r)).filter((o) => !optionIsAvailable(o)));

  /** Set when a load-affecting change was staged and needs review in Loads. */
  let pendingRole = $state<RegulationRole | null>(null);
  let refusal = $state<string | null>(null);

  const roles = $derived(regulationsStore.roles);
  const validation = $derived(regulationsStore.validation);

  function onSelect(role: RegulationRole, adapterId: string) {
    refusal = null;
    if (adapterId === '') return;
    const r = regulationsStore.requestChange(role, adapterId);
    if (r.kind === 'refused') {
      refusal = r.problems.map((p) => te({ key: p.key, params: p.params })).join(' ');
      return;
    }
    if (r.kind === 'needsLoadReview') {
      pendingRole = role;
      return;
    }
    pendingRole = null;
  }

  function goToLoads() {
    // The Design surface asks; Loads decides. The preview and Apply live there.
    uiStore.proActiveTab = 'loads';
    pendingRole = null;
  }

  function cancelChange() {
    regulationsStore.cancelPending();
    pendingRole = null;
  }

  function stateKey(b: RoleBinding): string {
    return `regulations.state.${b.state}`;
  }
</script>

<section class="regs" aria-labelledby="regs-title" data-testid="project-regulations">
  <!--
    The heading stays for the landmark and leaves the screen.

    `StageSection` already prints "1 · Project regulations" and a sentence of purpose directly
    above this. Repeating both here cost a duplicated title and a duplicated subtitle — and the
    duplicate was rendered at 0.95rem inside a section whose own title is 0.85rem, so the stage
    was visually SMALLER than the text inside it. `aria-labelledby` still needs a target, so the
    heading is kept and hidden rather than deleted.
  -->
  <h3 id="regs-title" class="sr-only">{t('regulations.title')}</h3>

  {#if pendingRole}
    {@const c = consequenceOf('loadRegulation')}
    <div class="notice warning" role="alert" data-testid="pending-load-change">
      <strong>{tp('regulations.pendingLoadChange', { role: t(`regulations.role.${pendingRole}`) })}</strong>
      <p>{t(c.explanationKey)}</p>
      <p class="req-solve">{t('regulations.requiresSolve')}</p>
      <div class="actions">
        <button data-testid="pending-review-in-loads" onclick={goToLoads}>
          {t('regulations.reviewInLoads')}
        </button>
        <button class="secondary" data-testid="pending-cancel" onclick={cancelChange}>
          {t('regulations.cancelChange')}
        </button>
      </div>
    </div>
  {/if}

  {#if refusal}
    <p class="notice error" role="alert" data-testid="regulation-refused">{refusal}</p>
  {/if}

  <!-- Jurisdiction applies to the whole stack; asking per role would be noise. -->
  <div class="jurisdiction">
    <label for="regs-jur">{t('regulations.jurisdiction')}</label>
    <input
      id="regs-jur" type="text" data-testid="regs-jurisdiction"
      value={roles.concrete.jurisdiction}
      placeholder={t('regulations.jurisdictionPlaceholder')}
      oninput={(e) => regulationsStore.setJurisdictionForAll(
        e.currentTarget.value, roles.concrete.adoption)}
    />
    <label for="regs-adoption">{t('regulations.adoption')}</label>
    <select
      id="regs-adoption" data-testid="regs-adoption" value={roles.concrete.adoption}
      onchange={(e) => regulationsStore.setJurisdictionForAll(
        roles.concrete.jurisdiction, e.currentTarget.value as RoleBinding['adoption'])}
    >
      {#each ['national', 'adopted', 'voluntary', 'unstated'] as a (a)}
        <option value={a}>{t(`regulations.adoption.${a}`)}</option>
      {/each}
    </select>
  </div>

  <ul class="roles">
    {#each REGULATION_ROLES as role (role)}
      {@const b = roles[role]}
      {@const opts = optionsForRole(role)}
      <li data-testid={`role-${role}`}>
        <div class="row">
          <label class="role-name" for={`sel-${role}`}>{t(`regulations.role.${role}`)}</label>
          <!-- What this role decides, so the selector is not a bare noun. -->
          <p class="role-purpose" data-testid={`role-purpose-${role}`}>
            {t(`regulations.rolePurpose.${role}`)}
          </p>
          <select
            id={`sel-${role}`} data-testid={`role-select-${role}`}
            value={b.adapterId ?? ''}
            onchange={(e) => onSelect(role, e.currentTarget.value)}
          >
            <option value="">{t('regulations.none')}</option>
            <!-- Unavailable editions are NOT offered here; they are listed below with a reason. -->
            {#each opts as o (o.adapterId)}
              <option value={o.adapterId}>{te(optionLabel(o))}</option>
            {/each}
          </select>

          {#if b.adapterId}
            <!-- The value in force, spelled out — a `<select>` shows it only while it fits. -->
            <span class="role-value" data-testid={`role-value-${role}`}>{b.edition}</span>
            <span class="badge state-{b.state}" data-testid={`role-state-${role}`}>
              {t(stateKey(b))}
            </span>
            <span class="badge maturity-{b.maturity.toLowerCase()}" data-testid={`role-maturity-${role}`}>
              {t(maturityLabelKey(b.maturity))}
            </span>
            {#if isLoadAffecting(role)}
              <span class="badge affects" title={t('regulations.affectsLoads')}>
                {t('regulations.affectsLoadsShort')}
              </span>
            {/if}
          {/if}
        </div>

        {#if b.adapterId}
          {@const o = opts.find((x) => x.adapterId === b.adapterId)}
          <details class="advanced">
            <summary>{t('regulations.advanced')}</summary>
            <dl>
              <dt>{t('regulations.edition')}</dt><dd>{b.edition}</dd>
              <dt>{t('regulations.provenanceLabel')}</dt>
              <dd>{b.jurisdiction || t('regulations.jurisdictionUnstated')} — {t(`regulations.adoption.${b.adoption}`)}</dd>
              <dt>{t('regulations.configLabel')}</dt>
              <dd>{b.configComplete ? t('regulations.configComplete') : t('regulations.configPending')}</dd>
              <dt>{t('regulations.invalidatesLabel')}</dt>
              <dd>{t(consequenceOf(isLoadAffecting(role) ? 'loadRegulation' : 'designRegulation').explanationKey)}</dd>
            </dl>
            {#if o?.noteKey}
              <p class="note">{t(o.noteKey)}</p>
            {/if}
          </details>
        {/if}
      </li>
    {/each}
  </ul>

  <!--
    Editions the catalogue knows about but cannot apply.
    Shown rather than silently omitted: a user looking for CIRSOC 201-2005 needs to learn
    that the app has not implemented it and WHY, instead of concluding the option was lost.
    Read-only by construction — this list drives no control.
  -->
  {#if reservedOptions.length > 0}
    <details class="reserved" data-testid="unavailable-editions">
      <summary>{t('regulations.unavailableEditions')} ({reservedOptions.length})</summary>
      <ul>
        {#each reservedOptions as o (o.role + o.adapterId)}
          <li data-testid={`unavailable-${o.adapterId}`}>
            <strong>{te(optionLabel(o))}</strong>
            <span class="badge unavailable">
              {t(availabilityOf(o) === 'UNAVAILABLE_SOURCE'
                ? 'regulations.availability.unavailableSource'
                : 'regulations.availability.unsupported')}
            </span>
            {#if o.noteKey}<p class="note">{t(o.noteKey)}</p>{/if}
          </li>
        {/each}
      </ul>
    </details>
  {/if}

  <!-- Aggregate size is a MIX property. Shown here as a requirement, edited in Materials. -->
  <div class="crossref" data-testid="aggregate-crossref">
    <strong>{t('regulations.aggregateRequirement')}</strong>
    <p>{t('regulations.aggregateOwnedByMaterial')}</p>
    <button data-testid="regs-edit-materials" onclick={() => (uiStore.proActiveTab = 'materials')}>
      {t('regulations.editInMaterials')}
    </button>
  </div>

  {#if validation.problems.length > 0}
    <div class="notice {validation.ok ? 'warning' : 'error'}" data-testid="stack-problems">
      <strong>{t('regulations.stackProblems')}</strong>
      <ul>
        {#each validation.problems as p (p.key + p.roles.join())}
          <li class={p.severity}>{te({ key: p.key, params: p.params })}</li>
        {/each}
      </ul>
    </div>
  {/if}
</section>

<style>
  /*
    ── Why this whole block was rewritten ─────────────────────────────

    Every defect below was a token that was never used:

    - `select` and `input` carried nothing but padding, so the browser painted them white on a
      dark panel. Four white dropdowns is what made this section look like a different program.
    - `h3` was 0.95rem inside `.regs { font-size: 0.85rem }`, above a panel whose stage titles are
      0.85rem — the section's own title was SMALLER than the text inside it.
    - Nine `opacity: 0.75…0.85` stood in for text colour, so "dimmer" was the only hierarchy and
      it applied to backgrounds and borders too.
    - `rgba(143, 163, 179, …)` appeared four times, hardcoded beside the tokens that mean it.
    - There was not one `:focus-visible` rule in the file.
    - `.role-name { min-width: 11rem }` plus `.row select { min-width: 15rem }` is 26rem of
      un-shrinkable content in a panel about 34rem wide, and `details.advanced` was then indented
      by a further 11.4rem. That is the horizontal overflow at 1280×720.
    - `@media (max-width: 820px)` asked the WINDOW while the panel is ~540px, so the stacked
      fallback never fired where it was needed — the same defect the detailing grid had.

    ── The layout ─────────────────────────────────────────────────────

    Rows stack: name and purpose, then the control, then the state. `minmax(0, 1fr)` everywhere a
    track holds text, so nothing refuses to shrink. A container query, because the question is how
    wide THIS panel is.
  */
  .regs {
    container-type: inline-size;
    padding: 0.1rem 0 0.3rem;
    font-size: 0.72rem;
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

  /* ── One control style for the whole section ──────────────────── */
  .regs :global(select),
  .regs :global(input[type='text']) {
    width: 100%;
    min-width: 0;
    padding: 0.2rem 0.35rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    background: var(--st-bg);
    color: var(--st-text);
    font: inherit;
    font-size: 0.72rem;
  }
  .regs :global(select:hover),
  .regs :global(input[type='text']:hover) { border-color: var(--st-interactive); }
  .regs :global(select:focus-visible),
  .regs :global(input[type='text']:focus-visible),
  .regs :global(button:focus-visible),
  .regs :global(summary:focus-visible) {
    outline: 2px solid var(--st-value);
    outline-offset: 1px;
  }
  /* Disabled is dimmer and still readable: it has to be legible to be an explanation. */
  .regs :global(select:disabled),
  .regs :global(input:disabled) {
    opacity: 0.6;
    cursor: not-allowed;
    border-color: var(--st-hair);
  }

  .regs :global(button) {
    padding: 0.2rem 0.6rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    background: var(--st-surface-3);
    color: var(--st-text);
    font-size: 0.7rem;
    cursor: pointer;
  }
  .regs :global(button:hover) { background: var(--st-hair-strong); }
  .regs :global(button:active) { background: var(--st-hair); }

  /* ── Jurisdiction ─────────────────────────────────────────────── */
  .jurisdiction {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.15rem;
    margin-bottom: 0.6rem;
  }
  .jurisdiction label { font-size: 0.68rem; color: var(--st-text-2); }
  .jurisdiction label:nth-of-type(2) { margin-top: 0.25rem; }
  @container (min-width: 26rem) {
    .jurisdiction { grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr); align-items: baseline; gap: 0.25rem 0.5rem; }
    .jurisdiction label:nth-of-type(2) { margin-top: 0; }
  }

  /* ── One role per row ─────────────────────────────────────────── */
  ul.roles { list-style: none; margin: 0; padding: 0; }
  ul.roles > li {
    border-top: 1px solid var(--st-hair);
    padding: 0.35rem 0;
  }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.15rem;
    align-items: baseline;
  }
  .role-name { font-size: 0.72rem; font-weight: 600; color: var(--st-text); }
  .role-purpose { margin: 0; font-size: 0.66rem; line-height: 1.35; color: var(--st-text-3); }
  .role-value { font-size: 0.68rem; color: var(--st-text-2); }

  /* The badges wrap as a group of their own rather than fighting the selector for the row. */
  .row .badge, .row .role-value { justify-self: start; }
  .badge {
    display: inline-block;
    font-size: 0.66rem; font-weight: 600;
    padding: 0.02rem 0.35rem; border-radius: 3px;
    background: var(--st-surface-3); color: var(--st-text);
    white-space: nowrap;
  }
  /* Applied, pending and stale are three words. Colour only supports them. */
  .state-applied { color: var(--st-ok); }
  .state-pending { color: var(--st-warn); }
  .state-stale { color: var(--st-warn); }
  .maturity-implemented_provisional { color: var(--st-warn); }
  .maturity-unsupported { color: var(--st-danger); }
  .maturity-validated { color: var(--st-text-2); }
  .affects { border: 1px solid var(--st-hair-strong); background: none; color: var(--st-text-2); }
  .unavailable { color: var(--st-warn); }

  details.advanced { margin: 0.25rem 0 0; }
  details.advanced summary {
    cursor: pointer;
    font-size: 0.68rem;
    color: var(--st-interactive);
  }
  dl {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.1rem 0.5rem;
    margin: 0.2rem 0 0;
    font-size: 0.68rem;
  }
  dt { font-weight: 600; color: var(--st-text-2); }
  dd { margin: 0; color: var(--st-text-2); }
  .note { font-size: 0.66rem; line-height: 1.35; color: var(--st-text-3); margin: 0.25rem 0 0; }

  /* ── Notices ──────────────────────────────────────────────────── */
  .notice {
    margin: 0.4rem 0;
    padding: 0.4rem 0.5rem;
    border-radius: 4px;
    line-height: 1.4;
    font-size: 0.68rem;
    background: var(--st-surface-3);
    color: var(--st-text);
  }
  .notice.warning { border-left: 2px solid var(--st-warn); }
  .notice.error { border-left: 2px solid var(--st-danger); }
  .notice p { margin: 0.25rem 0; }
  .notice strong { color: var(--st-text); }
  .req-solve { font-weight: 600; }
  .actions { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.35rem; }
  /* The cancel is the quieter of the two, by weight rather than by being invisible. */
  .actions :global(button.secondary) { background: none; }

  .reserved { font-size: 0.68rem; }
  .reserved summary { cursor: pointer; color: var(--st-interactive); }
  .reserved ul { list-style: none; margin: 0.2rem 0 0; padding: 0; }
  .reserved li { padding: 0.2rem 0; border-top: 1px solid var(--st-hair); }
  .reserved strong { color: var(--st-text); font-weight: 600; }

  .crossref {
    margin-top: 0.6rem;
    padding: 0.4rem 0.5rem;
    border: 1px dashed var(--st-hair-strong);
    border-radius: 4px;
  }
  .crossref strong { font-size: 0.7rem; color: var(--st-text); }
  .crossref p { margin: 0.2rem 0 0.35rem; font-size: 0.66rem; line-height: 1.35; color: var(--st-text-2); }

  li.error { color: var(--st-danger); }
  li.warning { color: var(--st-warn); }
</style>
