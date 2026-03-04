<script lang="ts">
  import type { CentralCore, ResolvedSection } from '../../lib/engine/section-stress';
  import { fmt } from './fmt';

  interface Props {
    showCentralCoreInfo: boolean;
    centralCore: CentralCore | null;
    resolved: ResolvedSection | undefined;
  }

  let { showCentralCoreInfo = $bindable(), centralCore, resolved }: Props = $props();

  const shapeLabel = $derived.by((): string => {
    if (!resolved) return '';
    switch (resolved.shape) {
      case 'rect': return 'Rectangular';
      case 'I': case 'H': return 'Doble T (I/H)';
      case 'CHS': return 'Circular hueca (CHS)';
      case 'RHS': return 'Rectangular hueca (RHS)';
      case 'T': return 'T';
      case 'L': return 'L (ángulo)';
      case 'C': return 'C (canal)';
      default: return resolved.shape;
    }
  });

  const coreShape = $derived.by((): string => {
    if (!resolved) return '';
    switch (resolved.shape) {
      case 'CHS': return 'Circular';
      case 'I': case 'H': return 'Hexagonal';
      default: return 'Rombo (diamante)';
    }
  });
</script>

<button class="ssp-section-toggle" onclick={() => showCentralCoreInfo = !showCentralCoreInfo}>
  <span class="ssp-chevron">{showCentralCoreInfo ? '▾' : '▸'}</span>
  Nucleo central
  <span class="ssp-help ssp-help-inline" title="El NC es una propiedad geométrica de la sección.&#10;Define dónde puede actuar N sin cambio de signo en σ.&#10;Activar el botón NC en la sección transversal para visualizarlo.">?</span>
</button>
{#if showCentralCoreInfo && centralCore && resolved}
  <div class="nc-detail">
    <p class="nc-desc">
      El <strong>núcleo central</strong> es una propiedad geométrica de la sección transversal,
      independiente de las cargas aplicadas.
    </p>
    <p class="nc-desc">
      Define la región alrededor del baricentro donde puede actuar una fuerza normal N
      sin producir cambio de signo en las tensiones normales &sigma;.
      Si el centro de presiones cae dentro del NC, toda la sección está en tracción o en compresión pura.
    </p>

    <div class="nc-divider"></div>

    <div class="nc-eq-title">Ecuaciones</div>
    <p class="nc-eq">
      Para cada fibra extrema a distancia <em>d</em> del baricentro, el vértice del NC está a:
    </p>
    <div class="nc-formula">e = W / A = I / (A · d)</div>
    <p class="nc-eq">
      donde W = módulo resistente, A = área, I = momento de inercia, d = distancia al extremo.
    </p>

    <div class="nc-divider"></div>

    <div class="nc-row">
      <span class="nc-label">Sección:</span>
      <span class="nc-val">{shapeLabel}</span>
    </div>
    <div class="nc-row">
      <span class="nc-label">Forma del NC:</span>
      <span class="nc-val">{coreShape}</span>
    </div>

    {#if resolved.shape === 'rect'}
      <p class="nc-eq nc-shape-note">
        Rombo con semi-ejes e<sub>y</sub> = h/6 y e<sub>z</sub> = b/6
      </p>
    {:else if resolved.shape === 'I' || resolved.shape === 'H'}
      <p class="nc-eq nc-shape-note">
        Hexágono: vértices en (0, ±I<sub>z</sub>/(A·h/2)) y (±I<sub>y</sub>/(A·b/2), ±I<sub>z</sub>/(A·y<sub>alma</sub>))
      </p>
    {:else if resolved.shape === 'CHS'}
      <p class="nc-eq nc-shape-note">
        Círculo de radio R<sub>nc</sub> = I<sub>z</sub>/(A·R) = R/4 (sección maciza)
      </p>
    {:else}
      <p class="nc-eq nc-shape-note">
        Rombo con e<sub>y</sub> = I<sub>z</sub>/(A·y<sub>max</sub>) y e<sub>z</sub> = I<sub>y</sub>/(A·z<sub>max</sub>)
      </p>
    {/if}

    <div class="nc-divider"></div>

    <div class="nc-row">
      <span class="nc-label">e<sub>y,max</sub> =</span>
      <span class="nc-val mono">{fmt(centralCore.eyMax * 1000, 1)} mm</span>
    </div>
    <div class="nc-row">
      <span class="nc-label">e<sub>z,max</sub> =</span>
      <span class="nc-val mono">{fmt(centralCore.ezMax * 1000, 1)} mm</span>
    </div>
  </div>
{/if}

<style>
  .ssp-section-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 3px 0;
    background: none;
    border: none;
    color: #888;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    cursor: pointer;
    border-bottom: 1px solid rgba(26, 74, 122, 0.3);
  }
  .ssp-section-toggle:hover { color: #ccc; }
  .ssp-chevron { font-size: 0.6rem; width: 10px; }

  .ssp-help {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: rgba(78, 205, 196, 0.12);
    color: #4ecdc4;
    font-size: 0.5rem;
    font-weight: 700;
    cursor: help;
    flex-shrink: 0;
    border: 1px solid rgba(78, 205, 196, 0.25);
    opacity: 0.6;
    transition: opacity 0.15s;
    font-style: normal;
    line-height: 1;
    vertical-align: middle;
  }
  .ssp-help:hover { opacity: 1; background: rgba(78, 205, 196, 0.25); }
  .ssp-help-inline { margin-left: auto; }

  .nc-detail {
    padding: 4px 0 6px;
  }

  .nc-desc {
    font-size: 0.68rem;
    color: #aaa;
    margin: 0 0 4px;
    line-height: 1.45;
  }

  .nc-divider {
    height: 1px;
    background: rgba(26, 74, 122, 0.3);
    margin: 5px 0;
  }

  .nc-eq-title {
    font-size: 0.65rem;
    color: #ff8c00;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin-bottom: 3px;
    font-weight: 600;
  }

  .nc-eq {
    font-size: 0.65rem;
    color: #999;
    margin: 0 0 3px;
    line-height: 1.4;
  }

  .nc-formula {
    font-family: 'Courier New', monospace;
    font-size: 0.7rem;
    color: #ff8c00;
    background: rgba(255, 140, 0, 0.08);
    border: 1px solid rgba(255, 140, 0, 0.15);
    border-radius: 4px;
    padding: 3px 6px;
    margin: 3px 0;
    text-align: center;
  }

  .nc-shape-note {
    color: #bbb;
    font-style: italic;
  }

  .nc-row {
    display: flex;
    align-items: baseline;
    gap: 4px;
    margin-bottom: 2px;
    font-size: 0.68rem;
    color: #aaa;
  }

  .nc-label {
    color: #888;
    min-width: 60px;
  }

  .nc-val {
    color: #ccc;
  }

  .nc-val.mono {
    font-family: 'Courier New', monospace;
    color: #ff8c00;
  }
</style>
