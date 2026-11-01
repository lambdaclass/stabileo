<script lang="ts">
  /**
   * The single degree of freedom system: m and k from a node of the model or
   * typed, damping, initial conditions and a harmonic force; the closed-form
   * answers and their charts update as the values change, and the explained
   * document is one click away.
   */
  import CourseSection from './CourseSection.svelte';
  import NumField from './NumField.svelte';
  import StepPlot from '../../steps/StepPlot.svelte';
  import { modelStore } from '../../../lib/store';
  import { courseDynamics } from '../../../lib/store/course-dynamics.svelte';
  import { t, tp } from '../../../lib/i18n';
  import { numText } from '../../../lib/engine/steps/format';
  import { sdofFromModel, defaultSdofNode } from '../../../lib/engine/dynamics/course/sdof-model';
  import { solveSdof, dafPlotOf, responsePlotOf } from '../../../lib/engine/steps/dynamics/sdof-doc';
  import { openExplainedMethod } from '../../../lib/actions/step-wizards';

  const s = $derived(courseDynamics.sdof);
  const points = $derived(modelStore.model.massSource?.points ?? []);
  const massNodes = $derived(points.filter((p) => p.m > 0 && modelStore.nodes.has(p.nodeId)).map((p) => p.nodeId));
  const node = $derived(s.nodeId !== null && massNodes.includes(s.nodeId) ? s.nodeId : defaultSdofNode(modelStore.model, points));

  const fromModel = $derived.by(() => {
    void modelStore.modelVersion;
    if (s.source !== 'model') return null;
    return sdofFromModel(modelStore.model, points, node, s.dir);
  });
  const mk = $derived(s.source === 'manual' ? { m: s.m, k: s.k } : fromModel && typeof fromModel !== 'string' ? { m: fromModel.m, k: fromModel.k } : null);
  const sol = $derived(mk && mk.m > 0 && mk.k > 0 ? solveSdof(mk.m, mk.k, s) : null);
  const summary = $derived(mk ? `m = ${numText(mk.m)} t · k = ${numText(mk.k)} kN/m` : t('course.dynamics.ui.sdof.undefined'));
</script>

<CourseSection title={t('course.dynamics.ui.sdof.title')} {summary} help={t('course.dynamics.ui.sdof.help')} testid="dyn-sdof">
  <div class="cf-seg" role="group">
    <button class:on={s.source === 'model'} onclick={() => courseDynamics.set({ sdof: { source: 'model' } })} data-testid="dyn-sdof-model">{t('course.dynamics.ui.sdof.fromModel')}</button>
    <button class:on={s.source === 'manual'} onclick={() => courseDynamics.set({ sdof: { source: 'manual' } })} data-testid="dyn-sdof-manual">{t('course.dynamics.ui.sdof.manual')}</button>
  </div>

  {#if s.source === 'model'}
    <div class="cf-grid">
      <label class="cf-field">
        <span>{t('course.dynamics.ui.sdof.node')}</span>
        <select value={node ?? ''} onchange={(e) => courseDynamics.set({ sdof: { nodeId: Number(e.currentTarget.value) } })} data-testid="dyn-sdof-node">
          {#each massNodes as n}<option value={n}>{n}</option>{/each}
        </select>
      </label>
      <label class="cf-field">
        <span>{t('course.dynamics.ui.sdof.dir')}</span>
        <select value={s.dir} onchange={(e) => courseDynamics.set({ sdof: { dir: e.currentTarget.value as 'ux' | 'uz' } })} data-testid="dyn-sdof-dir">
          <option value="ux">{t('course.dynamics.ui.sdof.dirX')}</option>
          <option value="uz">{t('course.dynamics.ui.sdof.dirZ')}</option>
        </select>
      </label>
    </div>
    {#if typeof fromModel === 'string'}
      <p class="cf-err">{t(`course.dynamics.sdof.err.${fromModel}`)}</p>
    {:else if fromModel}
      <p class="cf-hint">{tp('course.dynamics.ui.sdof.kInfo', { k: numText(fromModel.k), m: numText(fromModel.m) })}</p>
    {/if}
  {:else}
    <div class="cf-grid">
      <NumField label="m (t)" value={s.m} min={1e-9} onSet={(v) => courseDynamics.set({ sdof: { m: v } })} testid="dyn-sdof-m" />
      <NumField label="k (kN/m)" value={s.k} min={1e-9} onSet={(v) => courseDynamics.set({ sdof: { k: v } })} testid="dyn-sdof-k" />
    </div>
  {/if}

  <div class="cf-grid">
    <NumField label="ξ (%)" value={s.xi} scale={100} min={0} max={500} onSet={(v) => courseDynamics.set({ sdof: { xi: v } })} testid="dyn-sdof-xi" />
    <span></span>
    <NumField label="u₀ (mm)" value={s.u0} scale={1000} onSet={(v) => courseDynamics.set({ sdof: { u0: v } })} testid="dyn-sdof-u0" />
    <NumField label="v₀ (mm/s)" value={s.v0} scale={1000} onSet={(v) => courseDynamics.set({ sdof: { v0: v } })} testid="dyn-sdof-v0" />
  </div>

  {#if sol}
    {@const P = sol.props}
    <div class="cf-res" data-testid="dyn-sdof-props">
      ω = {numText(P.omega, 4)} rad/s · f = {numText(P.f, 4)} Hz · T = {numText(P.T, 4)} s<br />
      {t(`course.dynamics.sdof.regime.${P.regime}`)}{#if P.regime === 'underdamped'}{' · '}ω_D = {numText(P.omegaD, 4)} rad/s · δ = {numText(P.logDec, 4)}{/if}
    </div>
    <div class="cf-plot"><StepPlot plot={responsePlotOf(sol, false)} /></div>
    <p class="cf-caption">{t('course.dynamics.ui.sdof.freePlot')}</p>
  {/if}

  <span class="cf-sub">{t('course.dynamics.ui.sdof.force')}</span>
  <div class="cf-grid">
    <NumField label="F₀ (kN)" value={s.F0} onSet={(v) => courseDynamics.set({ sdof: { F0: v } })} testid="dyn-sdof-F0" />
    <NumField label="Ω (rad/s)" value={s.Omega ?? sol?.Omega ?? 0} min={0} onSet={(v) => courseDynamics.set({ sdof: { Omega: v } })} testid="dyn-sdof-Omega" />
  </div>
  {#if sol}
    <button class="cf-link" onclick={() => courseDynamics.set({ sdof: { Omega: sol.props.omega } })} data-testid="dyn-sdof-resonance">{t('course.dynamics.ui.sdof.toResonance')}</button>
    {#if sol.h}
      {@const h = sol.h}
      <div class="cf-res" data-testid="dyn-sdof-harm">
        {#if h.resonant}{t('course.dynamics.sdof.harm.resonantUndamped')}
        {:else}β = {numText(h.beta, 3)} · D = {numText(h.D, 4)} · X = {numText(h.X * 1000, 4)} mm · φ = {numText((h.phi * 180) / Math.PI, 3)}°{/if}
      </div>
      <div class="cf-plot"><StepPlot plot={responsePlotOf(sol, true)} /></div>
      <p class="cf-caption">{t('course.dynamics.ui.sdof.totalPlot')}</p>
      <div class="cf-plot"><StepPlot plot={dafPlotOf(sol.props.xi, h.beta)} /></div>
      <p class="cf-caption">{t('course.dynamics.sdof.dafCaption')}</p>
    {/if}
    <button class="cf-primary" onclick={() => openExplainedMethod('sdof')} data-testid="dyn-sdof-open">{t('course.dynamics.ui.stepByStep')}</button>
  {/if}
</CourseSection>

<style>
  .cf-sub { font-size: 0.66rem; font-weight: 600; color: var(--st-text-2); margin-top: 2px; }
</style>
