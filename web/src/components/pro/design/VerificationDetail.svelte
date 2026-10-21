<script lang="ts">
  /**
   * Per-member verification detail: the authoritative check table, the certificate
   * (or an explicit statement that there is none), and the code calculation memos.
   *
   * Utilization is demand/capacity everywhere; there is no `1/ratio` inversion left
   * anywhere in the surface.
   */
  import { noticesOf, noticeForConstraint } from '../../../lib/engine/design/notice-catalogue';
  import { t, tp } from '../../../lib/i18n';
  import { modelStore } from '../../../lib/store';
  import { generateInteractionSvg } from '../../../lib/engine/codes/argentina/interaction-diagram';
  import { verificationColumnDiagram } from '../../../lib/engine/design/column-interaction';
  import ColumnInteraction from '../desk/column/ColumnInteraction.svelte';
  import OutcomeBadge from './OutcomeBadge.svelte';
  import type { MemberContext } from '../../../lib/engine/design/member-context';
  import type { ProvidedRebarResult } from '../../../lib/engine/station-design-forces';
  import type { MemberDesignOutcome } from '../../../lib/engine/design/outcome';
  import { verificationStore } from '../../../lib/store/verification.svelte';
  import { verdictApproves, verdictReasons } from '../../../lib/store/member-verdict';

  interface Props {
    elementId: number;
    ctx: MemberContext;
    provided: ProvidedRebarResult | null;
    outcome: MemberDesignOutcome | undefined;
    onApplyAdvice: (o: MemberDesignOutcome) => void;
    /** The member's verdict is stated by the host already (the desk's inspector): not again here. */
    hideVerdict?: boolean;
  }
  let { elementId, ctx, provided, outcome, onApplyAdvice, hideVerdict = false }: Props = $props();

  // A shaped column draws its own section's curves; a rectangle its two-face diagram.
  const columnDiagram = $derived(verificationColumnDiagram(ctx, modelStore.elements.get(elementId)?.reinforcement));
  const demands = $derived(ctx.demands?.demands ?? []);
  /*
   * The member's verdict, apart from its local checks (`member-verdict.ts`): the certificate and
   * the rows below are the section's local checks, and their ✓ is never the member's state.
   */
  const verdict = $derived.by(() => { void provided; void outcome; return verificationStore.memberVerdict(elementId); });
  const approves = $derived(verdictApproves(verdict));

  function fmt(v: number | undefined): string {
    if (v === undefined) return '—';
    if (!Number.isFinite(v)) return '∞';
    return v.toFixed(2);
  }
  function fmtUtil(v: number): string {
    return Number.isFinite(v) ? v.toFixed(2) : '∞';
  }
</script>

<div class="detail" data-testid={`verification-detail-${elementId}`}>
  <!-- ─── The member's verdict: what every count and colour follows ─── -->
  {#if !hideVerdict}
  <div class="verdict" class:verdict-held={!approves} data-testid={`member-verdict-${elementId}`} data-status={verdict.status} data-local={verdict.local}>
    <strong>{t('verdict.member.title')}:</strong>
    <OutcomeBadge status={verdict.status} />
    {#if verdict.holds.length}
      <span class="verdict-holds" data-testid={`member-verdict-holds-${elementId}`}>{tp('verdict.member.heldBy', { reasons: verdictReasons({ ...verdict, assumptions: [] }, tp).join('; ') })}</span>
    {/if}
    {#if verdict.assumptions.length}
      <span class="muted" data-testid={`member-verdict-assumed-${elementId}`}>{tp('verdict.member.assumed', { reasons: verdictReasons({ ...verdict, holds: [] }, tp).join('; ') })}</span>
    {/if}
  </div>
  {/if}
  <!-- ─── Axis provenance: what was actually checked ─── -->
  <div class="axes-line" data-testid={`axes-${elementId}`}>
    <strong>{t('design.cert.axes')}:</strong>
    <span class="mono">{ctx.axes.flexure} / {ctx.axes.shear}</span>
    {#if ctx.axes.biaxial}<span class="mono">+ {ctx.axes.secondaryFlexure} ({(ctx.axes.secondaryRatio * 100).toFixed(0)} %)</span>{/if}
    <span class="muted">({t(`axesBasis.${ctx.axes.basis}`)})</span>
    {#if ctx.axes.secondaryCarriedBy === 'slab'}<span class="muted" data-testid={`axes-slab-${elementId}`}>{tp('axes.secondaryBySlab', { axis: ctx.axes.secondaryFlexure, r: (ctx.axes.secondaryRatio * 100).toFixed(0) })}</span>{/if}
    <span class="muted">b×h = {(ctx.axes.bFlex * 100).toFixed(0)}×{(ctx.axes.hFlex * 100).toFixed(0)} cm</span>
    {#if ctx.slenderDeltaNs > 1.0001}<span class="mono">δns = {ctx.slenderDeltaNs.toFixed(3)}</span>{/if}
    {#if (ctx.slenderDeltaS ?? 1) > 1.0001}<span class="mono">δs = {Number.isFinite(ctx.slenderDeltaS) ? ctx.slenderDeltaS.toFixed(3) : '∞'}</span>{/if}
  </div>

  <!-- ─── Certificate ─── -->
  {#if outcome?.outcome === 'VERIFIED' && outcome.certificate}
    {@const c = outcome.certificate}
    <div class="cert" class:cert-ok={approves} class:cert-local={!approves} data-testid={`certificate-${elementId}`}>
      <OutcomeBadge outcome="VERIFIED" compact />
      <span class="cert-scope" data-testid={`certificate-scope-${elementId}`}>{t('verdict.cert.scope')}</span>
      <span><strong>{t('design.cert.util')}:</strong> <span class="mono">{c.worstUtilization.toFixed(3)}</span></span>
      <span><strong>{t('design.cert.target')}:</strong> <span class="mono">{c.designTarget}</span></span>
      <span><strong>{t('design.cert.checks')}:</strong> <span class="mono">{c.checkCount}</span></span>
      <span><strong>{t('design.cert.axes')}:</strong> <span class="mono">{c.checkedAxes.join(', ')}</span></span>
      <span><strong>{t('design.cert.verifier')}:</strong> <span class="mono">{c.verifierId}</span></span>
      <span class="muted">{tp('design.cert.searchStats', {
        tried: outcome.searchStats.candidatesTried, calls: outcome.searchStats.verifierCalls,
        ms: outcome.searchStats.ms.toFixed(1) })}</span>
    </div>
  {:else if outcome}
    <div class="cert cert-none" data-testid={`no-certificate-${elementId}`}>
      <OutcomeBadge outcome={outcome.outcome} />
      <span>{t('design.cert.none')}</span>
      {#if outcome.searchStats.truncated}
        <span class="muted">{tp('design.cert.searchStats', {
          tried: outcome.searchStats.candidatesTried, calls: outcome.searchStats.verifierCalls,
          ms: outcome.searchStats.ms.toFixed(1) })}</span>
      {/if}
    </div>
    {#each outcome.reasons as r}
      <div class="reason" data-testid={`reason-${elementId}`}>{tp(r.key, r.params)}</div>
    {/each}
    {#if noticesOf(outcome).length > 0}
      <!-- The catalogue: each notice with its code, its cause and what to do about it. -->
      <ul class="notices" data-testid={`notices-${elementId}`}>
        {#each noticesOf(outcome) as n (n.code)}
          <li class="notice notice-{n.severity}" data-testid={`notice-${n.code}`}>
            <span class="notice-code">{n.code}</span>
            <span class="notice-cause">{t(n.causeKey)}</span>
            <span class="notice-fix">{t(n.fixKey)}</span>
          </li>
        {/each}
      </ul>
      <div class="limiting">
        {#each outcome.limiting as l}<span class="lim-chip" data-testid={`limiting-${l}`}>{noticeForConstraint(l).code}</span>{/each}
      </div>
    {/if}
    {#if outcome.provisional}
      <div class="prov-note" data-testid={`provisional-note-${elementId}`}>
        <OutcomeBadge flag="provisional" />
        <span class="muted">
          {t('design.changed.provisionalTitle')} — u = {fmtUtil(outcome.provisional.worstUtilization)},
          {tp('rcUi.failingChecks', { n: outcome.provisional.failingCheckCount })}
        </span>
      </div>
    {/if}
    {#if outcome.sectionAdvice}
      {@const a = outcome.sectionAdvice}
      <div class="advice" data-testid={`section-advice-${elementId}`}>
        <div class="advice-head">
          <strong>{t('design.advice.title')}</strong>
          <span class="prelim">{t('design.advice.preliminary')}</span>
        </div>
        <div class="advice-body">
          <span>{t('design.advice.current')}: <span class="mono">{(a.currentB * 1000).toFixed(0)}×{(a.currentH * 1000).toFixed(0)}</span></span>
          <span>→</span>
          <span>{t('design.advice.proposed')}: <span class="mono">{(a.proposedB * 1000).toFixed(0)}×{(a.proposedH * 1000).toFixed(0)}</span></span>
          <span>{t('design.advice.driver')}: <span class="mono">{a.driver}</span></span>
          {#if a.screenedUtilization !== undefined}
            <span class="muted">{t('rcUi.screenU')} ≈ {a.screenedUtilization.toFixed(2)}</span>
          {/if}
        </div>
        {#each a.rationale as r}<div class="reason">{tp(r.key, r.params)}</div>{/each}
        {#if !a.capReached}
          <button class="advice-btn" data-testid={`apply-advice-${elementId}`}
                  onclick={() => onApplyAdvice(outcome)}>{t('design.advice.apply')}</button>
        {/if}
      </div>
    {/if}
  {/if}

  <!-- ─── Authoritative check table ─── -->
  {#if provided && provided.checks.length > 0}
    <p class="local-title" data-testid={`local-checks-title-${elementId}`}><strong>{t('verdict.local.title')}</strong> <span class="muted">{t('verdict.local.note')}</span></p>
    <table class="checks" data-testid={`checks-${elementId}`}>
      <caption class="sr-only">{t('verdict.local.title')}</caption>
      <thead>
        <tr>
          <th scope="col">{t('design.detail.check')}</th><th scope="col">{t('design.detail.demandReq')}</th><th scope="col">{t('design.detail.capacityProv')}</th>
          <th scope="col">u = D/C</th><th scope="col">{t('verdict.local.status')}</th>
          <th scope="col">{t('design.detail.swept')}</th><th scope="col">{t('design.table.combo')}</th>
        </tr>
      </thead>
      <tbody>
        {#each provided.checks as c, ci (`${c.category}-${ci}`)}
          <tr class="chk chk-{c.status}" data-testid={`check-${c.category.replace(/\W+/g, '-')}`}>
            <td>{c.category}{c.missingReinforcement ? ' ⚠' : ''}</td>
            <td class="num">{c.demand !== undefined ? `${fmt(c.demand)} ${c.unit}` : fmt(c.required)}</td>
            <td class="num">{c.capacity !== undefined ? `${fmt(c.capacity)} ${c.unit}` : fmt(c.provided)}</td>
            <td class="num strong">{fmtUtil(c.ratio)}</td>
            <td><OutcomeBadge status={c.status} compact scope="local" /></td>
            <td class="num">{c.tuplesChecked || '—'}</td>
            <td class="mono small">{c.comboName ?? '—'}</td>
          </tr>
          {#if c.description}
            <tr class="desc-row"><td colspan="7" class="desc">{c.description}</td></tr>
          {/if}
        {/each}
      </tbody>
    </table>
  {:else}
    <div class="none-note" data-testid={`no-checks-${elementId}`}>
      <OutcomeBadge status="unavailable" />
      <span class="muted">{t('design.status.unavailable')}</span>
    </div>
  {/if}

  <!-- ─── Design-driving demands ─── -->
  {#if demands.length > 0}
    <details class="fold">
      <summary>{tp('design.detail.drivingDemands', { n: demands.length })}</summary>
      <table class="checks">
        <thead><tr><th scope="col">{t('design.detail.category')}</th><th scope="col">{t('design.detail.value')}</th><th scope="col">{t('design.detail.station')}</th><th scope="col">{t('design.table.combo')}</th></tr></thead>
        <tbody>
          {#each demands as d, di (`${d.category}-${di}`)}
            <tr>
              <td class="mono">{d.category}</td>
              <td class="num">{d.value.toFixed(1)}</td>
              <td class="num">x={d.stationX.toFixed(2)} m (t={d.stationT.toFixed(2)})</td>
              <td class="mono small">{d.comboName}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </details>
  {/if}

  <!-- ─── Interaction diagram of the column's own bars ───
       From the bars the member HAS and the design demand, so it reads the same steel the
       check table rated. It used to come from the required-steel baseline, a second verifier
       on 2005 rules, which also printed its own memos here as if they were this verification:
       the check table above is the memoria now, one row per check with its combination. -->
  {#if columnDiagram}
    <details class="fold">
      <summary>{t('design.detail.interactionDiagram')}</summary>
      {#if columnDiagram.kind === 'shaped'}
        <div class="diagram"><ColumnInteraction plot={columnDiagram.plot} /></div>
      {:else}
        <div class="diagram">{@html generateInteractionSvg(columnDiagram.diagram, { Nu: columnDiagram.Nu, Mu: columnDiagram.Mu }, 220, 280)}</div>
      {/if}
    </details>
  {/if}
</div>

<style>
  .notices { list-style: none; margin: 4px 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
  .notice { display: grid; grid-template-columns: auto 1fr; gap: 0 6px; font-size: 0.68rem; padding: 3px 5px; border-left: 2px solid var(--st-hair-strong); }
  .notice-error { border-left-color: var(--st-danger); }
  .notice-warning { border-left-color: var(--st-warn); }
  .notice-code { font-family: var(--st-mono, monospace); color: var(--st-text-3); grid-row: span 2; }
  .notice-fix { color: var(--st-text-2); }
  .detail { display: flex; flex-direction: column; gap: 5px; }
  .axes-line { display: flex; gap: 8px; flex-wrap: wrap; font-size: 0.68rem; color: var(--st-text-2); }
  /* Figures in the app's own face, aligned (QA of 20-oct: three faces in one panel). */
  .mono { font-variant-numeric: tabular-nums; }
  .small { font-size: 0.64rem; }
  .muted { color: var(--st-text-2); }
  .cert { display: flex; gap: 10px; flex-wrap: wrap; align-items: center;
    padding: 4px 7px; border-radius: 4px; font-size: 0.68rem; }
  .verdict { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; padding: 4px 6px; margin-bottom: 4px;
    border: 1px solid var(--st-text-3); border-radius: 4px; font-size: 0.7rem; }
  .verdict-held { border-color: var(--st-warn); }
  .verdict-holds { color: var(--st-text); }
  .cert-local { background: var(--st-surface-3); border: 1px solid var(--st-text-3); color: var(--st-text); }
  .cert-scope { color: var(--st-text-2); }
  .local-title { margin: 6px 0 2px; font-size: 0.72rem; }
  .cert-ok { background: rgba(34,204,102,0.10); border: 1px solid var(--st-ok); color: var(--st-text); }
  /* A violet fill on a badge whose border and label are both neutral, for a state that means
     "there is no certificate". `--st-provisional-bg` would be the near match and the wrong
     answer: an absence is not a provisional result, and the violet was quietly claiming it
     was. `--st-surface-3` is what its own border and text already said. */
  .cert-none { background: var(--st-surface-3); border: 1px solid var(--st-text-3); color: var(--st-text); }
  .reason { font-size: 0.67rem; color: var(--st-text-2); padding-left: 4px; }
  .limiting { display: flex; gap: 4px; flex-wrap: wrap; }
  .lim-chip { padding: 0 5px; background: var(--st-surface-3); border: 1px solid var(--st-text-3);
    border-radius: 3px; font-size: 0.62rem; color: var(--st-text); }
  .prov-note { display: flex; gap: 6px; align-items: center; font-size: 0.67rem; }
  /* The fourth site of the orange that was never `--st-warn` — beside a border that already
     was. One hue now. */
  .advice { border: 1px solid var(--st-warn); background: var(--st-warn-bg);
    border-radius: 4px; padding: 5px 7px; display: flex; flex-direction: column; gap: 3px; }
  .advice-head { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; font-size: 0.7rem; color: var(--st-text); }
  .prelim { font-size: 0.62rem; color: var(--st-warn); font-style: italic; }
  .advice-body { display: flex; gap: 10px; flex-wrap: wrap; font-size: 0.68rem; color: var(--st-text); }
  .advice-btn { align-self: flex-start; padding: 2px 8px; background: var(--st-hair-strong);
    border: 1px solid var(--st-warn); border-radius: 3px; color: var(--st-text);
    font-size: 0.68rem; font-weight: 600; cursor: pointer; }
  .advice-btn:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }
  table.checks { width: 100%; border-collapse: collapse; font-size: 0.67rem; }
  table.checks th { text-align: left; padding: 2px 5px; border-bottom: 1px solid var(--st-hair-strong); color: var(--st-info); }
  table.checks td { padding: 2px 5px; border-bottom: 1px solid var(--st-surface-3); color: var(--st-text); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .strong { font-weight: 700; }
  .chk-fail td { color: var(--st-danger); }
  .chk-warn td { color: var(--st-warn); }
  .desc-row td { border-bottom: 1px solid var(--st-surface-3); }
  .desc { font-size: 0.62rem; color: var(--st-text-2); padding-left: 12px !important; }
  .none-note { display: flex; gap: 6px; align-items: center; font-size: 0.68rem; }
  .fold { border: 1px solid var(--st-surface-3); border-radius: 4px; padding: 3px 6px; }
  .fold summary { cursor: pointer; font-size: 0.68rem; color: var(--st-info); }
  .memos { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 6px; margin-top: 4px; }
  .memo-title { font-size: 0.66rem; font-weight: 700; color: var(--st-text-2); }
  .memo-step { font-size: 0.62rem; color: var(--st-text-2); font-variant-numeric: tabular-nums; }
  .diagram { margin-top: 4px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
</style>
