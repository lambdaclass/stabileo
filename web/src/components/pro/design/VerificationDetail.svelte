<script lang="ts">
  /**
   * Per-member verification detail: the authoritative check table, the certificate
   * (or an explicit statement that there is none), and the code calculation memos.
   *
   * Utilization is demand/capacity everywhere; there is no `1/ratio` inversion left
   * anywhere in the surface.
   */
  import { t, tp } from '../../../lib/i18n';
  import { verificationStore } from '../../../lib/store';
  import { getCodeDetail } from '../../../lib/engine/verification-service';
  import { generateInteractionDiagram, generateInteractionSvg } from '../../../lib/engine/codes/argentina/interaction-diagram';
  import OutcomeBadge from './OutcomeBadge.svelte';
  import type { MemberContext } from '../../../lib/engine/design/member-context';
  import type { ProvidedRebarResult } from '../../../lib/engine/station-design-forces';
  import type { MemberDesignOutcome } from '../../../lib/engine/design/outcome';

  interface Props {
    elementId: number;
    ctx: MemberContext;
    provided: ProvidedRebarResult | null;
    outcome: MemberDesignOutcome | undefined;
    onApplyAdvice: (o: MemberDesignOutcome) => void;
  }
  let { elementId, ctx, provided, outcome, onApplyAdvice }: Props = $props();

  const codeDetail = $derived(getCodeDetail(verificationStore.concreteMap.get(elementId)));
  const demands = $derived(ctx.demands?.demands ?? []);

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
  <!-- ─── Axis provenance: what was actually checked ─── -->
  <div class="axes-line" data-testid={`axes-${elementId}`}>
    <strong>{t('design.cert.axes')}:</strong>
    <span class="mono">{ctx.axes.flexure} / {ctx.axes.shear}</span>
    {#if ctx.axes.biaxial}<span class="mono">+ {ctx.axes.secondaryFlexure} ({(ctx.axes.secondaryRatio * 100).toFixed(0)} %)</span>{/if}
    <span class="muted">({ctx.axes.basis})</span>
    <span class="muted">b×h = {(ctx.axes.bFlex * 100).toFixed(0)}×{(ctx.axes.hFlex * 100).toFixed(0)} cm</span>
    {#if ctx.slenderDeltaNs > 1.0001}<span class="mono">δns = {ctx.slenderDeltaNs.toFixed(3)}</span>{/if}
  </div>

  <!-- ─── Certificate ─── -->
  {#if outcome?.outcome === 'VERIFIED' && outcome.certificate}
    {@const c = outcome.certificate}
    <div class="cert cert-ok" data-testid={`certificate-${elementId}`}>
      <OutcomeBadge outcome="VERIFIED" />
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
    {#if outcome.limiting.length > 0}
      <div class="limiting">
        {#each outcome.limiting as l}<span class="lim-chip" data-testid={`limiting-${l}`}>{l}</span>{/each}
      </div>
    {/if}
    {#if outcome.provisional}
      <div class="prov-note" data-testid={`provisional-note-${elementId}`}>
        <OutcomeBadge flag="provisional" />
        <span class="muted">
          {t('design.changed.provisionalTitle')} — u = {fmtUtil(outcome.provisional.worstUtilization)},
          {outcome.provisional.failingCheckCount} failing
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
            <span class="muted">screen u ≈ {a.screenedUtilization.toFixed(2)}</span>
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
    <table class="checks" data-testid={`checks-${elementId}`}>
      <caption class="sr-only">{t('design.table.governing')}</caption>
      <thead>
        <tr>
          <th scope="col">Check</th><th scope="col">Demand / Req.</th><th scope="col">Capacity / Prov.</th>
          <th scope="col">u = D/C</th><th scope="col">{t('design.table.status')}</th>
          <th scope="col">Swept</th><th scope="col">{t('design.table.combo')}</th>
        </tr>
      </thead>
      <tbody>
        {#each provided.checks as c (c.category)}
          <tr class="chk chk-{c.status}" data-testid={`check-${c.category.replace(/\W+/g, '-')}`}>
            <td>{c.category}{c.missingReinforcement ? ' ⚠' : ''}</td>
            <td class="num">{c.demand !== undefined ? `${fmt(c.demand)} ${c.unit}` : fmt(c.required)}</td>
            <td class="num">{c.capacity !== undefined ? `${fmt(c.capacity)} ${c.unit}` : fmt(c.provided)}</td>
            <td class="num strong">{fmtUtil(c.ratio)}</td>
            <td><OutcomeBadge status={c.status} compact /></td>
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
      <summary>Design-driving demands ({demands.length})</summary>
      <table class="checks">
        <thead><tr><th scope="col">Category</th><th scope="col">Value</th><th scope="col">Station</th><th scope="col">Combo</th></tr></thead>
        <tbody>
          {#each demands as d (d.category)}
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

  <!-- ─── Interaction diagram + memos (code baseline) ─── -->
  {#if codeDetail?.interactionParams}
    {@const ip = codeDetail.interactionParams}
    {@const diagram = generateInteractionDiagram({ b: ip.b, h: ip.h, fc: ip.fc, fy: ip.fy, cover: ip.cover, AsProv: ip.AsProv, barCount: ip.barCount, barDia: ip.barDia })}
    <details class="fold">
      <summary>P-M interaction diagram</summary>
      <div class="diagram">{@html generateInteractionSvg(diagram, { Nu: ip.Nu, Mu: ip.Mu }, 220, 280)}</div>
    </details>
  {/if}

  {#if codeDetail && codeDetail.memos.length > 0}
    <details class="fold">
      <summary>CIRSOC 201 — calculation details</summary>
      <div class="memos">
        {#each codeDetail.memos as memo (memo.title)}
          <div class="memo">
            <div class="memo-title">{memo.title}</div>
            {#each memo.steps as s}<div class="memo-step">{s}</div>{/each}
          </div>
        {/each}
        {#if codeDetail.detailing}
          <div class="memo">
            <div class="memo-title">Detailing</div>
            {#each codeDetail.detailing.bars as b}
              <div class="memo-step">Ø{b.diameter}: ld={b.ld.toFixed(2)} m, ldh={b.ldh.toFixed(2)} m, splice={b.lapSplice.toFixed(2)} m</div>
            {/each}
          </div>
        {/if}
      </div>
    </details>
  {/if}
</div>

<style>
  .detail { display: flex; flex-direction: column; gap: 5px; }
  .axes-line { display: flex; gap: 8px; flex-wrap: wrap; font-size: 0.68rem; color: #9ab; }
  .mono { font-family: monospace; }
  .small { font-size: 0.64rem; }
  .muted { color: #778; }
  .cert { display: flex; gap: 10px; flex-wrap: wrap; align-items: center;
    padding: 4px 7px; border-radius: 4px; font-size: 0.68rem; }
  .cert-ok { background: rgba(34,204,102,0.10); border: 1px solid #2a7a4a; color: #b7e8c8; }
  .cert-none { background: rgba(180,120,220,0.10); border: 1px solid #5a3a7a; color: #ddc8ee; }
  .reason { font-size: 0.67rem; color: #b9a; padding-left: 4px; }
  .limiting { display: flex; gap: 4px; flex-wrap: wrap; }
  .lim-chip { padding: 0 5px; background: #2a1d38; border: 1px solid #5a3a7a;
    border-radius: 3px; font-size: 0.62rem; color: #d3b0e8; font-family: monospace; }
  .prov-note { display: flex; gap: 6px; align-items: center; font-size: 0.67rem; }
  .advice { border: 1px solid #8a4a10; background: rgba(255,102,0,0.08);
    border-radius: 4px; padding: 5px 7px; display: flex; flex-direction: column; gap: 3px; }
  .advice-head { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; font-size: 0.7rem; color: #ffcc9a; }
  .prelim { font-size: 0.62rem; color: #d8a878; font-style: italic; }
  .advice-body { display: flex; gap: 10px; flex-wrap: wrap; font-size: 0.68rem; color: #ffd9b3; }
  .advice-btn { align-self: flex-start; padding: 2px 8px; background: #6a3a10;
    border: 1px solid #a05a20; border-radius: 3px; color: #ffe0c0;
    font-size: 0.68rem; font-weight: 600; cursor: pointer; }
  .advice-btn:focus-visible { outline: 2px solid #4ecdc4; outline-offset: 1px; }
  table.checks { width: 100%; border-collapse: collapse; font-size: 0.67rem; }
  table.checks th { text-align: left; padding: 2px 5px; border-bottom: 1px solid #1d3a5c; color: #8ab; }
  table.checks td { padding: 2px 5px; border-bottom: 1px solid #10233c; color: #ccd; }
  .num { text-align: right; font-family: monospace; }
  .strong { font-weight: 700; }
  .chk-fail td { color: #ffbcbc; }
  .chk-warn td { color: #f3dda6; }
  .desc-row td { border-bottom: 1px solid #10233c; }
  .desc { font-size: 0.62rem; color: #778; padding-left: 12px !important; }
  .none-note { display: flex; gap: 6px; align-items: center; font-size: 0.68rem; }
  .fold { border: 1px solid #16304f; border-radius: 4px; padding: 3px 6px; }
  .fold summary { cursor: pointer; font-size: 0.68rem; color: #8ab; }
  .memos { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 6px; margin-top: 4px; }
  .memo-title { font-size: 0.66rem; font-weight: 700; color: #9ab; }
  .memo-step { font-size: 0.62rem; color: #889; font-family: monospace; }
  .diagram { margin-top: 4px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
</style>
