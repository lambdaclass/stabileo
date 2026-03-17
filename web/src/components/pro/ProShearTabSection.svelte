<script lang="ts">
  import { t } from '../../lib/i18n';
  import { designShearTab, generateShearTabSvg, type ShearTabResult, type ShearTabInput } from '../../lib/engine/codes/argentina/shear-tab-design';
  import type { BoltGrade } from '../../lib/engine/connection-design';
  import type { JointForces } from '../../lib/engine/connection-design';

  interface Props {
    jointForces: JointForces | null;
    onresult?: (input: ShearTabInput, result: ShearTabResult) => void;
  }

  let { jointForces, onresult }: Props = $props();

  let beamDepth = $state(300);
  let beamTw = $state(8);
  let beamFy = $state(345);
  let beamFu = $state(450);
  let plateHeight = $state(230);
  let plateThickness = $state(10);
  let plateFy = $state(250);
  let plateFu = $state(400);
  let boltDia = $state(20);
  let boltGrade = $state<BoltGrade>('8.8');
  let nBolts = $state(3);
  let boltSpacing = $state(75);
  let boltEdgeDist = $state(35);
  let boltGage = $state(55);
  let threadsInShear = $state(true);
  let weldLeg = $state(6);
  let weldFexx = $state(490);
  let stVu = $state(150);
  let stResult = $state<ShearTabResult | null>(null);

  function autoFill() {
    if (!jointForces) return;
    stVu = Math.round(jointForces.maxV * 10) / 10;
  }

  function run() {
    const input: ShearTabInput = {
      beamDepth, beamTw, beamFy, beamFu,
      plateHeight, plateThickness, plateFy, plateFu,
      boltDia, boltGrade, nBolts, boltSpacing, boltEdgeDist, boltGage, threadsInShear,
      weldLeg, weldFexx, Vu: stVu,
    };
    stResult = designShearTab(input);
    onresult?.(input, stResult);
  }

  function statusClass(s: 'ok' | 'warn' | 'fail'): string {
    return `st-${s}`;
  }
</script>

<details class="st-section">
  <summary class="st-header">
    <span class="st-title">{t('conn.shearTab')}</span>
    {#if stResult}
      <span class="st-badge {statusClass(stResult.overallStatus)}">{(stResult.overallRatio * 100).toFixed(0)}%</span>
    {/if}
  </summary>

  <div class="st-body">
    <p class="st-desc">{t('conn.stDesc')}</p>

    <!-- ── SVG preview (before results, shows geometry) ── -->
    {#if stResult}
      <div class="st-svg-wrap">
        {@html generateShearTabSvg({
          beamDepth, beamTw, beamFy, beamFu,
          plateHeight, plateThickness, plateFy, plateFu,
          boltDia, boltGrade, nBolts, boltSpacing, boltEdgeDist, boltGage, threadsInShear,
          weldLeg, weldFexx, Vu: stVu,
        }, stResult)}
      </div>
    {/if}

    <!-- ── Beam ── -->
    <fieldset class="st-fieldset">
      <legend>{t('conn.stBeam')}</legend>
      <div class="st-grid">
        <label><span class="st-lbl">d</span><input type="number" class="st-inp" bind:value={beamDepth} step={10} min={100} /><span class="st-unit">mm</span></label>
        <label><span class="st-lbl">tw</span><input type="number" class="st-inp" bind:value={beamTw} step={0.5} min={3} /><span class="st-unit">mm</span></label>
        <label><span class="st-lbl">Fy</span><input type="number" class="st-inp" bind:value={beamFy} step={10} min={200} /><span class="st-unit">MPa</span></label>
        <label><span class="st-lbl">Fu</span><input type="number" class="st-inp" bind:value={beamFu} step={10} min={300} /><span class="st-unit">MPa</span></label>
      </div>
    </fieldset>

    <!-- ── Plate ── -->
    <fieldset class="st-fieldset">
      <legend>{t('conn.stPlate')}</legend>
      <div class="st-grid">
        <label><span class="st-lbl">Hp</span><input type="number" class="st-inp" bind:value={plateHeight} step={10} min={50} /><span class="st-unit">mm</span></label>
        <label><span class="st-lbl">tp</span><input type="number" class="st-inp" bind:value={plateThickness} step={1} min={4} /><span class="st-unit">mm</span></label>
        <label><span class="st-lbl">Fy</span><input type="number" class="st-inp" bind:value={plateFy} step={10} min={200} /><span class="st-unit">MPa</span></label>
        <label><span class="st-lbl">Fu</span><input type="number" class="st-inp" bind:value={plateFu} step={10} min={300} /><span class="st-unit">MPa</span></label>
      </div>
    </fieldset>

    <!-- ── Bolts ── -->
    <fieldset class="st-fieldset">
      <legend>{t('conn.stBolts')}</legend>
      <div class="st-grid">
        <label><span class="st-lbl">&empty;</span><input type="number" class="st-inp" bind:value={boltDia} step={2} min={12} max={36} /><span class="st-unit">mm</span></label>
        <label><span class="st-lbl">{t('conn.grade')}</span>
          <select class="st-inp st-sel" bind:value={boltGrade}>
            <option value="4.6">4.6</option><option value="5.6">5.6</option>
            <option value="8.8">8.8</option><option value="10.9">10.9</option>
          </select>
        </label>
        <label><span class="st-lbl">n</span><input type="number" class="st-inp" bind:value={nBolts} min={2} max={12} /></label>
        <label><span class="st-lbl">s</span><input type="number" class="st-inp" bind:value={boltSpacing} step={5} min={50} /><span class="st-unit">mm</span></label>
        <label><span class="st-lbl">Le</span><input type="number" class="st-inp" bind:value={boltEdgeDist} step={5} min={25} /><span class="st-unit">mm</span></label>
        <label><span class="st-lbl">g</span><input type="number" class="st-inp" bind:value={boltGage} step={5} min={30} /><span class="st-unit">mm</span></label>
      </div>
      <label class="st-checkbox"><input type="checkbox" bind:checked={threadsInShear} /> {t('conn.threadsInShear')}</label>
    </fieldset>

    <!-- ── Weld ── -->
    <fieldset class="st-fieldset">
      <legend>{t('conn.stWeld')}</legend>
      <div class="st-grid">
        <label><span class="st-lbl">a</span><input type="number" class="st-inp" bind:value={weldLeg} min={3} max={16} /><span class="st-unit">mm</span></label>
        <label><span class="st-lbl">Fexx</span><input type="number" class="st-inp" bind:value={weldFexx} step={10} min={350} /><span class="st-unit">MPa</span></label>
      </div>
    </fieldset>

    <!-- ── Demand + action ── -->
    <div class="st-demand">
      <label><span class="st-lbl">Vu</span><input type="number" class="st-inp st-inp-lg" bind:value={stVu} step={5} /><span class="st-unit">kN</span></label>
      <div class="st-actions">
        {#if jointForces}
          <button class="st-btn-auto" onclick={autoFill}>{t('conn.autoFill')}</button>
        {/if}
        <button class="st-btn-run" onclick={run}>{t('conn.verify')}</button>
      </div>
    </div>

    <!-- ── Results ── -->
    {#if stResult}
      <div class="st-results">
        <div class="st-checks-title">{t('conn.stChecksTitle')}</div>
        {#each [
          { label: t('conn.stBoltShear'), r: stResult.boltShear },
          { label: t('conn.stBoltBearing'), r: stResult.boltBearing },
          { label: t('conn.stPlateShearYield'), r: stResult.plateShearYield },
          { label: t('conn.stPlateShearRupture'), r: stResult.plateShearRupture },
          { label: t('conn.stBlockShear'), r: stResult.blockShear },
          { label: t('conn.stWeldCheck'), r: stResult.weld },
        ] as check}
          <details class="st-check">
            <summary class="st-check-sum">
              <span>{check.label}</span>
              <span class="st-badge sm {statusClass(check.r.status)}">{(check.r.ratio * 100).toFixed(0)}%</span>
            </summary>
            <div class="st-steps">
              {#each check.r.steps as step}
                <div class="st-step">{step}</div>
              {/each}
            </div>
          </details>
        {/each}
        <div class="st-overall {statusClass(stResult.overallStatus)}">
          <span>{t('conn.governing')}</span>
          <span class="st-overall-val">
            {(stResult.overallRatio * 100).toFixed(0)}%
            {stResult.overallStatus === 'ok' ? ' OK' : stResult.overallStatus === 'warn' ? ' !' : ' NG'}
          </span>
        </div>
      </div>
    {/if}
  </div>
</details>

<style>
  /* ─── Section wrapper ─── */
  .st-section { border-bottom: 1px solid #1a3050; }
  .st-header {
    padding: 8px 10px; font-size: 0.75rem; color: #ccc; cursor: pointer;
    display: flex; align-items: center; gap: 8px;
  }
  .st-header:hover { color: #fff; }
  .st-title { flex: 1; }
  .st-body { padding: 4px 10px 12px; }
  .st-desc {
    font-size: 0.66rem; color: #778; line-height: 1.4; margin: 0 0 8px;
    padding: 6px 8px; background: rgba(78, 205, 196, 0.04); border-radius: 4px;
    border-left: 2px solid #4ecdc433;
  }

  /* ─── Fieldsets ─── */
  .st-fieldset {
    border: 1px solid #1a3050; border-radius: 5px; padding: 6px 8px 8px;
    margin: 0 0 6px;
  }
  .st-fieldset legend {
    font-size: 0.62rem; color: #4ecdc4; font-weight: 600; padding: 0 4px;
    text-transform: uppercase; letter-spacing: 0.5px;
  }

  /* ─── Grid ─── */
  .st-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 4px;
  }
  .st-grid label {
    display: flex; align-items: center; gap: 3px;
    font-size: 0.68rem; color: #888;
  }
  .st-lbl {
    min-width: 24px; font-weight: 500; color: #aaa; font-size: 0.66rem;
  }
  .st-inp {
    width: 54px; padding: 3px 4px; background: #0f2840; border: 1px solid #1a3050;
    border-radius: 3px; color: #ddd; font-size: 0.70rem; font-family: monospace; text-align: right;
  }
  .st-inp:focus { border-color: #4ecdc4; outline: none; }
  .st-inp-lg { width: 72px; }
  .st-sel { text-align: left; width: 62px; }
  .st-unit { font-size: 0.58rem; color: #556; min-width: 22px; }
  .st-checkbox {
    display: flex; align-items: center; gap: 5px; margin-top: 4px;
    font-size: 0.66rem; color: #888; cursor: pointer;
  }
  .st-checkbox input { accent-color: #4ecdc4; }

  /* ─── Demand row ─── */
  .st-demand {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    margin: 8px 0 4px; padding: 6px 8px;
    background: #0d1f35; border-radius: 5px; border: 1px solid #1a3050;
  }
  .st-demand label {
    display: flex; align-items: center; gap: 3px;
    font-size: 0.70rem; color: #ccc; font-weight: 500;
  }
  .st-actions { display: flex; gap: 6px; margin-left: auto; }
  .st-btn-auto {
    padding: 3px 8px; font-size: 0.62rem; color: #4ecdc4; background: transparent;
    border: 1px solid #4ecdc4; border-radius: 3px; cursor: pointer;
  }
  .st-btn-auto:hover { background: rgba(78, 205, 196, 0.1); }
  .st-btn-run {
    padding: 4px 14px; font-size: 0.72rem; font-weight: 600; color: #111;
    background: #4ecdc4; border: none; border-radius: 4px; cursor: pointer;
  }
  .st-btn-run:hover { background: #3dbdb4; }

  /* ─── SVG preview ─── */
  .st-svg-wrap {
    display: flex; justify-content: center; margin: 0 0 8px;
    padding: 4px; background: #0a1525; border-radius: 5px; border: 1px solid #1a3050;
  }

  /* ─── Results ─── */
  .st-results { margin-top: 8px; }
  .st-checks-title {
    font-size: 0.64rem; color: #4ecdc4; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.5px; margin-bottom: 4px; padding-left: 2px;
  }
  .st-check { border-bottom: 1px solid #0f2030; }
  .st-check-sum {
    padding: 4px 6px; font-size: 0.68rem; color: #ccc; cursor: pointer;
    display: flex; justify-content: space-between; align-items: center;
  }
  .st-check-sum:hover { color: #fff; }
  .st-steps { padding: 4px 8px; }
  .st-step { font-family: monospace; font-size: 0.58rem; color: #aaa; padding: 1px 0; }

  .st-overall {
    display: flex; justify-content: space-between; align-items: center;
    padding: 6px 8px; margin-top: 4px; border-radius: 4px; font-size: 0.72rem; font-weight: 600;
    border: 1px solid #1a3050;
  }
  .st-overall.st-ok { background: rgba(34, 204, 102, 0.08); border-color: rgba(34, 204, 102, 0.3); color: #ccc; }
  .st-overall.st-warn { background: rgba(240, 165, 0, 0.08); border-color: rgba(240, 165, 0, 0.3); color: #ccc; }
  .st-overall.st-fail { background: rgba(233, 69, 96, 0.08); border-color: rgba(233, 69, 96, 0.3); color: #ccc; }
  .st-overall-val { font-family: monospace; }
  .st-overall.st-ok .st-overall-val { color: #22cc66; }
  .st-overall.st-warn .st-overall-val { color: #f0a500; }
  .st-overall.st-fail .st-overall-val { color: #e94560; }

  /* ─── Badges ─── */
  .st-badge {
    font-size: 0.62rem; font-weight: 700; padding: 1px 6px; border-radius: 8px;
  }
  .st-badge.sm { font-size: 0.58rem; padding: 0 5px; }
  .st-badge.st-ok { background: rgba(34, 204, 102, 0.2); color: #22cc66; }
  .st-badge.st-warn { background: rgba(240, 165, 0, 0.2); color: #f0a500; }
  .st-badge.st-fail { background: rgba(233, 69, 96, 0.2); color: #e94560; }
</style>
