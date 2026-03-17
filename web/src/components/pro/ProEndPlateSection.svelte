<script lang="ts">
  import { t } from '../../lib/i18n';
  import { designEndPlate, generateEndPlateSvg, type EndPlateResult, type EndPlateType, type EndPlateInput } from '../../lib/engine/codes/argentina/end-plate-design';
  import type { BoltGrade } from '../../lib/engine/connection-design';
  import type { JointForces } from '../../lib/engine/connection-design';

  interface Props {
    jointForces: JointForces | null;
    onresult?: (input: EndPlateInput, result: EndPlateResult) => void;
  }

  let { jointForces, onresult }: Props = $props();

  let epType = $state<EndPlateType>('flush');
  let beamDepth = $state(300);
  let beamBf = $state(150);
  let beamTf = $state(10);
  let beamTw = $state(7);
  let beamFy = $state(345);
  let beamFu = $state(450);
  let plateWidth = $state(160);
  let plateThickness = $state(16);
  let plateFy = $state(250);
  let plateFu = $state(400);
  let boltDia = $state(20);
  let boltGrade = $state<BoltGrade>('10.9');
  let nBoltsPerRow = $state(2);
  let nRowsTension = $state(1);
  let boltGageG = $state(100);
  let pf = $state(35);
  let pext = $state(50);
  let threadsInShear = $state(true);
  let hasStiffeners = $state(false);
  let epMu = $state(80);
  let epVu = $state(100);
  let epResult = $state<EndPlateResult | null>(null);

  $effect(() => {
    nRowsTension = epType === 'extended' ? 2 : 1;
  });

  function autoFill() {
    if (!jointForces) return;
    epVu = Math.round(jointForces.maxV * 10) / 10;
    epMu = Math.round(jointForces.maxM * 10) / 10;
  }

  function run() {
    const input: EndPlateInput = {
      type: epType,
      beamDepth, beamBf, beamTf, beamTw, beamFy, beamFu,
      plateWidth, plateThickness, plateFy, plateFu,
      boltDia, boltGrade, nBoltsPerRow, nRowsTension,
      boltGageG, pf, pext: epType === 'extended' ? pext : undefined,
      threadsInShear, hasStiffeners,
      Mu: epMu, Vu: epVu,
    };
    epResult = designEndPlate(input);
    onresult?.(input, epResult);
  }

  function statusClass(s: 'ok' | 'warn' | 'fail'): string {
    return `st-${s}`;
  }
</script>

<details class="ep-section">
  <summary class="ep-header">
    <span class="ep-title">{t('conn.endPlate')}</span>
    {#if epResult}
      <span class="ep-badge {statusClass(epResult.overallStatus)}">{(epResult.overallRatio * 100).toFixed(0)}%</span>
    {/if}
  </summary>

  <div class="ep-body">
    <p class="ep-desc">{t('conn.epDesc')}</p>

    <!-- ── SVG preview ── -->
    {#if epResult}
      <div class="ep-svg-wrap">
        {@html generateEndPlateSvg({
          type: epType,
          beamDepth, beamBf, beamTf, beamTw, beamFy, beamFu,
          plateWidth, plateThickness, plateFy, plateFu,
          boltDia, boltGrade, nBoltsPerRow, nRowsTension,
          boltGageG, pf, pext: epType === 'extended' ? pext : undefined,
          threadsInShear, hasStiffeners,
          Mu: epMu, Vu: epVu,
        }, epResult)}
      </div>
    {/if}

    <!-- ── Type selector ── -->
    <fieldset class="ep-fieldset">
      <legend>{t('conn.epType')}</legend>
      <div class="ep-type-row">
        <label class="ep-radio" class:active={epType === 'flush'}>
          <input type="radio" name="ep-type" value="flush" bind:group={epType} />
          {t('conn.epFlush')}
          <span class="ep-type-hint">{t('conn.epFlushHint')}</span>
        </label>
        <label class="ep-radio" class:active={epType === 'extended'}>
          <input type="radio" name="ep-type" value="extended" bind:group={epType} />
          {t('conn.epExtended')}
          <span class="ep-type-hint">{t('conn.epExtendedHint')}</span>
        </label>
      </div>
    </fieldset>

    <!-- ── Beam ── -->
    <fieldset class="ep-fieldset">
      <legend>{t('conn.epBeam')}</legend>
      <div class="ep-grid">
        <label><span class="ep-lbl">d</span><input type="number" class="ep-inp" bind:value={beamDepth} step={10} min={100} /><span class="ep-unit">mm</span></label>
        <label><span class="ep-lbl">bf</span><input type="number" class="ep-inp" bind:value={beamBf} step={5} min={50} /><span class="ep-unit">mm</span></label>
        <label><span class="ep-lbl">tf</span><input type="number" class="ep-inp" bind:value={beamTf} step={0.5} min={4} /><span class="ep-unit">mm</span></label>
        <label><span class="ep-lbl">tw</span><input type="number" class="ep-inp" bind:value={beamTw} step={0.5} min={3} /><span class="ep-unit">mm</span></label>
        <label><span class="ep-lbl">Fy</span><input type="number" class="ep-inp" bind:value={beamFy} step={10} min={200} /><span class="ep-unit">MPa</span></label>
        <label><span class="ep-lbl">Fu</span><input type="number" class="ep-inp" bind:value={beamFu} step={10} min={300} /><span class="ep-unit">MPa</span></label>
      </div>
    </fieldset>

    <!-- ── End Plate ── -->
    <fieldset class="ep-fieldset">
      <legend>{t('conn.epPlateTitle')}</legend>
      <div class="ep-grid">
        <label><span class="ep-lbl">Bp</span><input type="number" class="ep-inp" bind:value={plateWidth} step={10} min={80} /><span class="ep-unit">mm</span></label>
        <label><span class="ep-lbl">tp</span><input type="number" class="ep-inp" bind:value={plateThickness} step={1} min={8} /><span class="ep-unit">mm</span></label>
        <label><span class="ep-lbl">Fy</span><input type="number" class="ep-inp" bind:value={plateFy} step={10} min={200} /><span class="ep-unit">MPa</span></label>
        <label><span class="ep-lbl">Fu</span><input type="number" class="ep-inp" bind:value={plateFu} step={10} min={300} /><span class="ep-unit">MPa</span></label>
      </div>
    </fieldset>

    <!-- ── Bolts ── -->
    <fieldset class="ep-fieldset">
      <legend>{t('conn.epBolts')}</legend>
      <div class="ep-grid">
        <label><span class="ep-lbl">&empty;</span><input type="number" class="ep-inp" bind:value={boltDia} step={2} min={12} max={36} /><span class="ep-unit">mm</span></label>
        <label><span class="ep-lbl">{t('conn.grade')}</span>
          <select class="ep-inp ep-sel" bind:value={boltGrade}>
            <option value="4.6">4.6</option><option value="5.6">5.6</option>
            <option value="8.8">8.8</option><option value="10.9">10.9</option>
          </select>
        </label>
        <label><span class="ep-lbl">{t('conn.epBoltsPerRow')}</span><input type="number" class="ep-inp" bind:value={nBoltsPerRow} min={2} max={4} /></label>
        <label><span class="ep-lbl">{t('conn.epRowsTension')}</span><input type="number" class="ep-inp" bind:value={nRowsTension} min={1} max={4} /></label>
        <label><span class="ep-lbl">g</span><input type="number" class="ep-inp" bind:value={boltGageG} step={10} min={60} /><span class="ep-unit">mm</span></label>
        <label><span class="ep-lbl">pf</span><input type="number" class="ep-inp" bind:value={pf} step={5} min={20} /><span class="ep-unit">mm</span></label>
        {#if epType === 'extended'}
          <label><span class="ep-lbl">pext</span><input type="number" class="ep-inp" bind:value={pext} step={5} min={20} /><span class="ep-unit">mm</span></label>
        {/if}
      </div>
      <div class="ep-check-row">
        <label class="ep-checkbox"><input type="checkbox" bind:checked={threadsInShear} /> {t('conn.threadsInShear')}</label>
        <label class="ep-checkbox"><input type="checkbox" bind:checked={hasStiffeners} /> {t('conn.epStiffeners')}</label>
      </div>
    </fieldset>

    <!-- ── Demand + action ── -->
    <div class="ep-demand">
      <label><span class="ep-lbl-d">Mu</span><input type="number" class="ep-inp ep-inp-lg" bind:value={epMu} step={5} /><span class="ep-unit">kN&middot;m</span></label>
      <label><span class="ep-lbl-d">Vu</span><input type="number" class="ep-inp ep-inp-lg" bind:value={epVu} step={5} /><span class="ep-unit">kN</span></label>
      <div class="ep-actions">
        {#if jointForces}
          <button class="ep-btn-auto" onclick={autoFill}>{t('conn.autoFill')}</button>
        {/if}
        <button class="ep-btn-run" onclick={run}>{t('conn.verify')}</button>
      </div>
    </div>

    <!-- ── Results ── -->
    {#if epResult}
      <div class="ep-results">
        <div class="ep-checks-title">{t('conn.epChecksTitle')}</div>
        {#each [
          { label: t('conn.epBoltTension'), r: epResult.boltTension },
          { label: t('conn.epPlateBending'), r: epResult.plateBending },
          { label: t('conn.epFlangeForce'), r: epResult.beamFlangeForcce },
          { label: t('conn.epShear'), r: epResult.shear },
        ] as check}
          <details class="ep-check">
            <summary class="ep-check-sum">
              <span>{check.label}</span>
              <span class="ep-badge sm {statusClass(check.r.status)}">{(check.r.ratio * 100).toFixed(0)}%</span>
            </summary>
            <div class="ep-steps">
              {#each check.r.steps as step}
                <div class="ep-step">{step}</div>
              {/each}
            </div>
          </details>
        {/each}
        <div class="ep-overall {statusClass(epResult.overallStatus)}">
          <span>{t('conn.governing')}</span>
          <span class="ep-overall-val">
            {(epResult.overallRatio * 100).toFixed(0)}%
            {epResult.overallStatus === 'ok' ? ' OK' : epResult.overallStatus === 'warn' ? ' !' : ' NG'}
          </span>
        </div>
      </div>
    {/if}
  </div>
</details>

<style>
  /* ─── Section wrapper ─── */
  .ep-section { border-bottom: 1px solid #1a3050; }
  .ep-header {
    padding: 8px 10px; font-size: 0.75rem; color: #ccc; cursor: pointer;
    display: flex; align-items: center; gap: 8px;
  }
  .ep-header:hover { color: #fff; }
  .ep-title { flex: 1; }
  .ep-body { padding: 4px 10px 12px; }
  .ep-desc {
    font-size: 0.66rem; color: #778; line-height: 1.4; margin: 0 0 8px;
    padding: 6px 8px; background: rgba(78, 205, 196, 0.04); border-radius: 4px;
    border-left: 2px solid #4ecdc433;
  }

  /* ─── Type selector ─── */
  .ep-type-row { display: flex; gap: 6px; }
  .ep-radio {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;
    padding: 6px 8px; border: 1px solid #1a3050; border-radius: 5px;
    font-size: 0.70rem; color: #aaa; cursor: pointer; text-align: center;
    transition: border-color 0.15s, background 0.15s;
  }
  .ep-radio:hover { border-color: #4ecdc466; }
  .ep-radio.active { border-color: #4ecdc4; background: rgba(78, 205, 196, 0.06); color: #fff; }
  .ep-radio input[type="radio"] { display: none; }
  .ep-type-hint { font-size: 0.54rem; color: #556; }
  .ep-radio.active .ep-type-hint { color: #4ecdc499; }

  /* ─── Fieldsets ─── */
  .ep-fieldset {
    border: 1px solid #1a3050; border-radius: 5px; padding: 6px 8px 8px;
    margin: 0 0 6px;
  }
  .ep-fieldset legend {
    font-size: 0.62rem; color: #4ecdc4; font-weight: 600; padding: 0 4px;
    text-transform: uppercase; letter-spacing: 0.5px;
  }

  /* ─── Grid ─── */
  .ep-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 4px;
  }
  .ep-grid label {
    display: flex; align-items: center; gap: 3px;
    font-size: 0.68rem; color: #888;
  }
  .ep-lbl {
    min-width: 24px; font-weight: 500; color: #aaa; font-size: 0.66rem;
  }
  .ep-inp {
    width: 54px; padding: 3px 4px; background: #0f2840; border: 1px solid #1a3050;
    border-radius: 3px; color: #ddd; font-size: 0.70rem; font-family: monospace; text-align: right;
  }
  .ep-inp:focus { border-color: #4ecdc4; outline: none; }
  .ep-inp-lg { width: 72px; }
  .ep-sel { text-align: left; width: 62px; }
  .ep-unit { font-size: 0.58rem; color: #556; min-width: 22px; }
  .ep-check-row { display: flex; gap: 12px; margin-top: 4px; flex-wrap: wrap; }
  .ep-checkbox {
    display: flex; align-items: center; gap: 5px;
    font-size: 0.66rem; color: #888; cursor: pointer;
  }
  .ep-checkbox input { accent-color: #4ecdc4; }

  /* ─── Demand row ─── */
  .ep-demand {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    margin: 8px 0 4px; padding: 6px 8px;
    background: #0d1f35; border-radius: 5px; border: 1px solid #1a3050;
  }
  .ep-demand label {
    display: flex; align-items: center; gap: 3px;
    font-size: 0.70rem; color: #ccc;
  }
  .ep-lbl-d { font-weight: 600; color: #ccc; min-width: 20px; font-size: 0.68rem; }
  .ep-actions { display: flex; gap: 6px; margin-left: auto; }
  .ep-btn-auto {
    padding: 3px 8px; font-size: 0.62rem; color: #4ecdc4; background: transparent;
    border: 1px solid #4ecdc4; border-radius: 3px; cursor: pointer;
  }
  .ep-btn-auto:hover { background: rgba(78, 205, 196, 0.1); }
  .ep-btn-run {
    padding: 4px 14px; font-size: 0.72rem; font-weight: 600; color: #111;
    background: #4ecdc4; border: none; border-radius: 4px; cursor: pointer;
  }
  .ep-btn-run:hover { background: #3dbdb4; }

  /* ─── SVG preview ─── */
  .ep-svg-wrap {
    display: flex; justify-content: center; margin: 0 0 8px;
    padding: 4px; background: #0a1525; border-radius: 5px; border: 1px solid #1a3050;
  }

  /* ─── Results ─── */
  .ep-results { margin-top: 8px; }
  .ep-checks-title {
    font-size: 0.64rem; color: #4ecdc4; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.5px; margin-bottom: 4px; padding-left: 2px;
  }
  .ep-check { border-bottom: 1px solid #0f2030; }
  .ep-check-sum {
    padding: 4px 6px; font-size: 0.68rem; color: #ccc; cursor: pointer;
    display: flex; justify-content: space-between; align-items: center;
  }
  .ep-check-sum:hover { color: #fff; }
  .ep-steps { padding: 4px 8px; }
  .ep-step { font-family: monospace; font-size: 0.58rem; color: #aaa; padding: 1px 0; }

  .ep-overall {
    display: flex; justify-content: space-between; align-items: center;
    padding: 6px 8px; margin-top: 4px; border-radius: 4px; font-size: 0.72rem; font-weight: 600;
    border: 1px solid #1a3050;
  }
  .ep-overall.st-ok { background: rgba(34, 204, 102, 0.08); border-color: rgba(34, 204, 102, 0.3); color: #ccc; }
  .ep-overall.st-warn { background: rgba(240, 165, 0, 0.08); border-color: rgba(240, 165, 0, 0.3); color: #ccc; }
  .ep-overall.st-fail { background: rgba(233, 69, 96, 0.08); border-color: rgba(233, 69, 96, 0.3); color: #ccc; }
  .ep-overall-val { font-family: monospace; }
  .ep-overall.st-ok .ep-overall-val { color: #22cc66; }
  .ep-overall.st-warn .ep-overall-val { color: #f0a500; }
  .ep-overall.st-fail .ep-overall-val { color: #e94560; }

  /* ─── Badges ─── */
  .ep-badge {
    font-size: 0.62rem; font-weight: 700; padding: 1px 6px; border-radius: 8px;
  }
  .ep-badge.sm { font-size: 0.58rem; padding: 0 5px; }
  .ep-badge.st-ok { background: rgba(34, 204, 102, 0.2); color: #22cc66; }
  .ep-badge.st-warn { background: rgba(240, 165, 0, 0.2); color: #f0a500; }
  .ep-badge.st-fail { background: rgba(233, 69, 96, 0.2); color: #e94560; }
</style>
