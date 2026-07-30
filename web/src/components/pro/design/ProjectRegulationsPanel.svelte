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
  <h3 id="regs-title">{t('regulations.title')}</h3>
  <p class="subtitle">{t('regulations.subtitle')}</p>

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
          <select
            id={`sel-${role}`} data-testid={`role-select-${role}`}
            value={b.adapterId ?? ''}
            onchange={(e) => onSelect(role, e.currentTarget.value)}
          >
            <option value="">{t('regulations.none')}</option>
            {#each opts as o (o.adapterId)}
              <option value={o.adapterId}>{te(optionLabel(o))}</option>
            {/each}
          </select>

          {#if b.adapterId}
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
  .regs { padding: 0.75rem 1rem; font-size: 0.85rem; }
  h3 { margin: 0 0 0.15rem; font-size: 0.95rem; }
  .subtitle { margin: 0 0 0.7rem; opacity: 0.75; }
  .jurisdiction { display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 0.4rem 0.6rem; align-items: center; margin-bottom: 0.7rem; }
  .jurisdiction input, .jurisdiction select { width: 100%; padding: 0.25rem 0.4rem; }
  ul.roles { list-style: none; margin: 0; padding: 0; }
  ul.roles > li { border-top: 1px solid rgba(128,128,128,0.25); padding: 0.4rem 0; }
  .row { display: flex; flex-wrap: wrap; gap: 0.45rem; align-items: center; }
  .role-name { min-width: 11rem; font-weight: 500; }
  .row select { min-width: 15rem; padding: 0.25rem 0.4rem; }
  .badge { font-size: 0.7rem; font-weight: 600; padding: 0.1rem 0.4rem; border-radius: 3px; background: rgba(128,128,128,0.28); }
  .state-applied { background: #14532d; color: #dcfce7; }
  /* Pending and stale are never green. */
  .state-pending { background: #7a5b00; color: #fff6dd; }
  .state-stale { background: #7a1f1f; color: #ffe3e3; }
  .maturity-implemented_provisional { background: #7a5b00; color: #fff6dd; }
  .maturity-unsupported { background: #7a1f1f; color: #ffe3e3; }
  .maturity-validated { background: #14532d; color: #dcfce7; }
  .affects { background: #1e3a5f; color: #dbeafe; }
  details.advanced { margin: 0.3rem 0 0 11.4rem; }
  details.advanced summary { cursor: pointer; font-size: 0.78rem; opacity: 0.8; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 0.15rem 0.6rem; margin: 0.3rem 0 0; font-size: 0.78rem; }
  dt { font-weight: 600; opacity: 0.75; }
  dd { margin: 0; }
  .note { font-size: 0.78rem; opacity: 0.8; margin: 0.3rem 0 0; }
  .notice { margin: 0.5rem 0; padding: 0.5rem 0.6rem; border-radius: 4px; line-height: 1.4; }
  .notice.warning { background: #7a5b00; color: #fff6dd; }
  .notice.error { background: #7a1f1f; color: #ffe3e3; }
  .notice p { margin: 0.3rem 0; }
  .req-solve { font-weight: 600; }
  .actions { display: flex; gap: 0.5rem; margin-top: 0.4rem; }
  .actions button.secondary { background: transparent; border: 1px solid currentColor; color: inherit; }
  .crossref { margin-top: 0.8rem; padding: 0.5rem 0.6rem; border: 1px dashed rgba(128,128,128,0.5); border-radius: 4px; }
  .crossref p { margin: 0.25rem 0 0.4rem; font-size: 0.8rem; opacity: 0.85; }
  li.error { color: #fca5a5; }
  li.warning { color: #fde68a; }
  @media (max-width: 820px) {
    .jurisdiction { grid-template-columns: 1fr; }
    .role-name { min-width: 0; }
    details.advanced { margin-left: 0; }
  }
</style>
