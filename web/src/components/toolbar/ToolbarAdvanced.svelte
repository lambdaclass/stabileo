<script lang="ts">
  import { uiStore, modelStore, resultsStore, dsmStepsStore } from '../../lib/store';
  import { solvePDelta } from '../../lib/engine/pdelta';
  import { solveModal } from '../../lib/engine/modal';
  import { solveBuckling } from '../../lib/engine/buckling';
  import { solvePlastic } from '../../lib/engine/plastic';
  import { solveMovingLoads, solveMovingLoadsAsync, PREDEFINED_TRAINS } from '../../lib/engine/moving-loads';
  import { solveSpectral, cirsoc103Spectrum } from '../../lib/engine/spectral';
  import { solveDetailed } from '../../lib/engine/solver-detailed';
  import { solveDetailed3D } from '../../lib/engine/solver-detailed-3d';

  let showAdvanced = $state(false);
  let showTrainPanel = $state(false);
  let selectedTrainIndex = $state<string>('');
  let advHelpKey = $state<string | null>(null);

  // Listen for tour event to auto-open advanced section
  $effect(() => {
    const openAdvanced = () => { showAdvanced = true; };
    window.addEventListener('dedaliano-open-advanced', openAdvanced);
    return () => {
      window.removeEventListener('dedaliano-open-advanced', openAdvanced);
    };
  });

  const ADV_HELP: Record<string, { label: string; text: string }> = {
    'pdelta': {
      label: 'P-\u0394 (2\u00b0 Orden)',
      text: 'An\u00e1lisis no lineal geom\u00e9trico. Considera c\u00f3mo las fuerzas axiales modifican la rigidez lateral de la estructura (efecto P-\u0394). Itera hasta convergencia y reporta el factor de amplificaci\u00f3n B\u2082. Si B\u2082 > 1.4, la estructura es sensible a efectos de segundo orden. Requiere haber calculado primero.',
    },
    'buckling': {
      label: 'Pcr \u2014 Carga Cr\u00edtica (Euler)',
      text: 'Calcula la carga de pandeo el\u00e1stico por autovalores de la matriz de rigidez geom\u00e9trica. El factor \u03bb_cr indica cu\u00e1nto habr\u00eda que multiplicar las cargas actuales para que la estructura pandee. Si \u03bb_cr < 1, la estructura ya super\u00f3 su carga cr\u00edtica. Muestra la longitud efectiva (Keff) de cada barra comprimida.',
    },
    'modal': {
      label: 'An\u00e1lisis Din\u00e1mico (Modal)',
      text: 'Calcula los modos de vibraci\u00f3n y frecuencias propias de la estructura usando la matriz de masa consistente. Reporta: frecuencia (Hz), per\u00edodo (s), masa modal efectiva (%) en X e Y, y coeficientes de amortiguamiento de Rayleigh. Es prerrequisito del an\u00e1lisis espectral. Requiere densidad del material (\u03c1).',
    },
    'spectral': {
      label: 'An\u00e1lisis Espectral (CIRSOC 103)',
      text: 'Combinaci\u00f3n modal espectral con espectro de dise\u00f1o s\u00edsmico CIRSOC 103 (Argentina). Calcula el corte basal, desplazamientos y esfuerzos m\u00e1ximos combinando los modos mediante CQC o SRSS. Requiere haber ejecutado primero el an\u00e1lisis din\u00e1mico. Usa Zona 4, Suelo tipo II por defecto.',
    },
    'plastic': {
      label: 'Colapso Pl\u00e1stico',
      text: 'An\u00e1lisis incremental que va formando articulaciones pl\u00e1sticas en los puntos donde el momento alcanza Mp (momento pl\u00e1stico = Wpl \u00d7 fy). En cada paso se recalcula la estructura con la nueva articulaci\u00f3n. El factor \u03bb indica cu\u00e1nto multiplicar las cargas para alcanzar el mecanismo de colapso. Requiere fy del material.',
    },
    'dsm': {
      label: 'Paso a Paso \u2014 M\u00e9todo de las Rigideces',
      text: 'Muestra detalladamente cada etapa del M\u00e9todo de la Rigidez Directa: numeraci\u00f3n de grados de libertad, matrices de rigidez locales [k], transformaciones [T], ensamblaje global [K], vector de cargas {F}, aplicaci\u00f3n de condiciones de borde, resoluci\u00f3n del sistema {u} = [K]\u207b\u00b9{F}, y obtenci\u00f3n de reacciones y fuerzas internas. Ideal para estudiar y aprender el m\u00e9todo.',
    },
    'envelope': {
      label: 'Envolvente de Esfuerzos',
      text: 'Envolvente de esfuerzos por combinaciones de carga. Resuelve cada caso de carga por separado y los combina con los factores definidos en la tabla de combinaciones (ej: 1.2D + 1.6L). Muestra la envolvente de m\u00e1ximos y m\u00ednimos (+/\u2212) de momento, corte y axil. Permite comparar cada combinaci\u00f3n individual desde el dropdown "Principal" en Configuraci\u00f3n \u2192 Resultados. Requiere tener combinaciones definidas en la pesta\u00f1a "Combinaciones".',
    },
    'trainLoad': {
      label: 'Tren de Carga',
      text: 'Un tren de cargas (ej: cami\u00f3n HL-93, t\u00e1ndem) recorre la estructura en m\u00faltiples posiciones. En cada posici\u00f3n se resuelve la estructura completa y se registran los esfuerzos. Las cargas del tren se SUMAN a las cargas existentes del modelo \u2014 si quer\u00e9s solo el efecto del tren, elimin\u00e1 las dem\u00e1s cargas. Despu\u00e9s de calcular, us\u00e1 las flechas \u25c0\u25b6 para recorrer las posiciones y "Ver envolvente" para ver los esfuerzos m\u00e1ximos y m\u00ednimos de todas las posiciones. Herramienta cl\u00e1sica para dise\u00f1o de puentes y estructuras bajo cargas vehiculares.',
    },
    'influenceLine': {
      label: 'L\u00ednea de Influencia',
      text: 'Muestra c\u00f3mo var\u00eda una magnitud fija (reacci\u00f3n, momento o corte en una secci\u00f3n espec\u00edfica) cuando una carga unitaria P=1 recorre la estructura. Click\u00e1 un nodo para ver la LI de sus reacciones (Ry, Rx, Mz) o una barra para ver M o V en esa secci\u00f3n. Herramienta cl\u00e1sica para dise\u00f1o de puentes y estructuras bajo cargas m\u00f3viles. Atajo: tecla I.',
    },
    'kinematic': {
      label: 'An\u00e1lisis Cinem\u00e1tico',
      text: 'An\u00e1lisis paso a paso de la estabilidad cinem\u00e1tica de la estructura. Muestra el grado de hiperestaticidad (f\u00f3rmula detallada con cada apoyo y articulaci\u00f3n), verifica num\u00e9ricamente por rango de Kff si hay mecanismos ocultos, y sugiere correcciones si la estructura es inestable. Funciona sin necesidad de resolver — se actualiza en tiempo real al modificar el modelo.',
    },
    'stress': {
      label: 'Tensiones \u2014 An\u00e1lisis de Secci\u00f3n',
      text: 'An\u00e1lisis tensional completo de secciones transversales. Click\u00e1 una barra para ver: tensi\u00f3n normal \u03c3 (Navier: \u03c3 = N/A + M\u00b7y/I), tensi\u00f3n de corte \u03c4 (Jourawski: \u03c4 = V\u00b7Q/(I\u00b7b)), tensi\u00f3n equivalente de Von Mises (\u03c3_vm = \u221a(\u03c3\u00b2 + 3\u03c4\u00b2)), c\u00edrculo de Mohr con tensiones principales, diagrama de flujo de corte para perfiles de pared delgada, y ratio de utilizaci\u00f3n vs fy. Incluye un slider para recorrer las fibras de la secci\u00f3n (0=borde inferior, 1=borde superior) y navegaci\u00f3n por secciones cr\u00edticas (m\u00e1ximo momento, apoyos, puntos de carga). Soporta secciones rectangular, I, U, L, caj\u00f3n (RHS) y tubular (CHS).',
    },
    'whatif': {
      label: 'Explorar (\u00bfQu\u00e9 pasa si\u2026?)',
      text: 'Panel interactivo de an\u00e1lisis de sensibilidad param\u00e9trica. Permite ajustar en tiempo real la magnitud de las cargas, el m\u00f3dulo de elasticidad E del material, y las propiedades de secci\u00f3n (\u00e1rea A e inercia Iz) mediante sliders. La estructura se recalcula instant\u00e1neamente con cada cambio (~60ms) mostrando c\u00f3mo var\u00edan los diagramas, deformadas y reacciones. Ideal para entender el comportamiento estructural, optimizar secciones, y responder preguntas tipo "\u00bfqu\u00e9 pasa si duplico la carga?" o "\u00bfqu\u00e9 pasa si uso un perfil m\u00e1s r\u00edgido?". Los cambios son temporales \u2014 al cerrar el panel se restaura el modelo original.',
    },
  };

  function toggleAdvHelp(key: string, e: MouseEvent) {
    e.stopPropagation();
    advHelpKey = advHelpKey === key ? null : key;
  }

  function handlePDelta() {
    const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
    if (!input) { uiStore.toast('Modelo vac\u00edo', 'error'); return; }
    try {
      const t0 = performance.now();
      const result = solvePDelta(input);
      const dt = performance.now() - t0;
      if (typeof result === 'string') { uiStore.toast(result, 'error'); return; }
      resultsStore.setPDeltaResult(result);
      const msg = result.converged
        ? `P-\u0394 convergi\u00f3 en ${result.iterations} iter, B\u2082=${result.b2Factor.toFixed(2)} (${dt.toFixed(0)}ms)`
        : result.isStable ? `P-\u0394 no convergi\u00f3 (${result.iterations} iter)` : 'Estructura inestable (P-\u0394)';
      uiStore.toast(msg, result.converged ? 'success' : 'error');
    } catch (e: any) {
      uiStore.toast(e.message || 'Error P-Delta', 'error');
    }
  }

  function handleModal() {
    const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
    if (!input) { uiStore.toast('Modelo vac\u00edo', 'error'); return; }
    // Build densities map from model materials (rho in kN/m\u00b3 \u2192 need kg/m\u00b3)
    // rho is stored as kN/m\u00b3 in the model. 1 kN/m\u00b3 \u2248 101.97 kg/m\u00b3...
    // Actually the model stores rho as kN/m\u00b3 (e.g. 78.5 for steel)
    // The mass matrix module expects kg/m\u00b3 and converts internally
    // 78.5 kN/m\u00b3 = 7850 kg/m\u00b3 \u2192 multiply by 1000/9.81 \u2248 101.97
    // But wait \u2014 rho in the model is weight density (kN/m\u00b3),
    // mass density = weight density / g = rho / 9.81 \u2192 in kg/m\u00b3 = rho * 1000/9.81
    const densities = new Map<number, number>();
    for (const [id, mat] of modelStore.materials) {
      // mat.rho is weight density in kN/m\u00b3; convert to mass density in kg/m\u00b3
      densities.set(id, mat.rho * 1000 / 9.81);
    }
    try {
      const t0 = performance.now();
      const result = solveModal(input, densities);
      const dt = performance.now() - t0;
      if (typeof result === 'string') { uiStore.toast(result, 'error'); return; }
      resultsStore.setModalResult(result);
      const rayleighInfo = result.rayleigh ? ` | Rayleigh: a\u2080=${result.rayleigh.a0.toFixed(3)}, a\u2081=${result.rayleigh.a1.toFixed(5)}` : '';
      const cumMassInfo = ` | \u03a3Meff: X=${(result.cumulativeMassRatioX * 100).toFixed(0)}%, Y=${(result.cumulativeMassRatioY * 100).toFixed(0)}%`;
      uiStore.toast(`Din\u00e1mico: ${result.modes.length} modos${cumMassInfo}${rayleighInfo} (${dt.toFixed(0)}ms)`, 'success');
    } catch (e: any) {
      uiStore.toast(e.message || 'Error an\u00e1lisis din\u00e1mico', 'error');
    }
  }

  function handleSpectral() {
    if (!resultsStore.modalResult) {
      uiStore.toast('Primero ejecute el an\u00e1lisis din\u00e1mico (modal)', 'error');
      return;
    }
    const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
    if (!input) { uiStore.toast('Modelo vac\u00edo', 'error'); return; }

    // Build densities (same as modal)
    const densities = new Map<number, number>();
    for (const [id, mat] of modelStore.materials) {
      densities.set(id, mat.rho * 1000 / 9.81);
    }

    try {
      const spectrum = cirsoc103Spectrum(4, 'II'); // Default: Zone 4, Soil II
      const t0 = performance.now();
      const resultX = solveSpectral(input, resultsStore.modalResult, densities, {
        direction: 'X',
        spectrum,
        rule: 'CQC',
      });
      const dt = performance.now() - t0;
      if (typeof resultX === 'string') { uiStore.toast(resultX, 'error'); return; }
      // Store spectral result in results store
      resultsStore.setSpectralResult(resultX);
      uiStore.toast(`Espectral CQC: V_base=${resultX.baseShear.toFixed(1)} kN, Zona 4 Suelo II (${dt.toFixed(0)}ms)`, 'success');
    } catch (e: any) {
      uiStore.toast(e.message || 'Error an\u00e1lisis espectral', 'error');
    }
  }

  function handleBuckling() {
    const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
    if (!input) { uiStore.toast('Modelo vac\u00edo', 'error'); return; }
    try {
      const t0 = performance.now();
      const result = solveBuckling(input);
      const dt = performance.now() - t0;
      if (typeof result === 'string') { uiStore.toast(result, 'error'); return; }
      resultsStore.setBucklingResult(result);
      const factor = result.modes[0]?.loadFactor;
      const nComp = result.elementData.length;
      uiStore.toast(`Pandeo: \u03bb_cr=${factor?.toFixed(2)}, ${nComp} elem. comprimidos (${dt.toFixed(0)}ms)`, 'success');
    } catch (e: any) {
      uiStore.toast(e.message || 'Error pandeo', 'error');
    }
  }

  function handlePlastic() {
    const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
    if (!input) { uiStore.toast('Modelo vac\u00edo', 'error'); return; }
    const sections = new Map<number, { a: number; iz: number; b?: number; h?: number }>();
    for (const [id, sec] of modelStore.sections) {
      sections.set(id, { a: sec.a, iz: sec.iy ?? sec.iz, b: sec.b, h: sec.h });
    }
    const materials = new Map<number, { fy?: number }>();
    for (const [id, mat] of modelStore.materials) {
      materials.set(id, { fy: mat.fy });
    }
    try {
      const t0 = performance.now();
      const result = solvePlastic(input, sections, materials);
      const dt = performance.now() - t0;
      if (typeof result === 'string') { uiStore.toast(result, 'error'); return; }
      resultsStore.setPlasticResult(result);
      const msg = result.isMechanism
        ? `Colapso pl\u00e1stico: \u03bb=${result.collapseFactor.toFixed(2)}, ${result.hinges.length}/${result.redundancy + 1} articulaciones (${dt.toFixed(0)}ms)`
        : `Pl\u00e1stico: ${result.hinges.length} articulaciones, \u03bb=${result.collapseFactor.toFixed(2)}, hiperestaticidad=${result.redundancy} (${dt.toFixed(0)}ms)`;
      uiStore.toast(msg, result.isMechanism ? 'info' : 'success');
    } catch (e: any) {
      uiStore.toast(e.message || 'Error pl\u00e1stico', 'error');
    }
  }

  async function handleMovingLoad(trainIndex: number) {
    const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
    if (!input) { uiStore.toast('Modelo vac\u00edo', 'error'); return; }
    const train = PREDEFINED_TRAINS[trainIndex];
    if (!train) return;

    const abortController = resultsStore.startMovingLoadAnalysis();

    try {
      const t0 = performance.now();
      const result = await solveMovingLoadsAsync(
        input,
        { train },
        (progress) => resultsStore.updateMovingLoadProgress(progress.current, progress.total),
        abortController.signal,
      );
      const dt = performance.now() - t0;

      if (abortController.signal.aborted) return;

      if (typeof result === 'string') {
        uiStore.toast(result, 'error');
        return;
      }
      resultsStore.setMovingLoadEnvelope(result);
      uiStore.toast(`Tren de carga: ${result.positions.length} posiciones, envolvente calculada (${dt.toFixed(0)}ms)`, 'success');
    } catch (e: any) {
      if (!abortController.signal.aborted) {
        uiStore.toast(e.message || 'Error carga m\u00f3vil', 'error');
      }
    } finally {
      resultsStore.finishMovingLoad();
    }
  }

  function handleSolveCombinations() {
    if (uiStore.analysisMode === '3d') {
      const result = modelStore.solveCombinations3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand');
      if (typeof result === 'string') {
        uiStore.toast(result, 'error');
      } else if (result) {
        resultsStore.setCombinationResults3D(result.perCase, result.perCombo, result.envelope);
        const nCombos = result.perCombo.size;
        const nCases = result.perCase.size;
        uiStore.toast(`${nCombos} combinaciones 3D calculadas (${nCases} casos de carga).`, 'success');
      }
      return;
    }
    const result = modelStore.solveCombinations(uiStore.includeSelfWeight);
    if (typeof result === 'string') {
      uiStore.toast(result, 'error');
    } else if (result) {
      resultsStore.setCombinationResults(result.perCase, result.perCombo, result.envelope);
      const nCombos = result.perCombo.size;
      const nCases = result.perCase.size;
      uiStore.toast(`${nCombos} combinaciones calculadas (${nCases} casos de carga). Us\u00e1 "Principal" en diagramas M/V/N para ver Envolvente o combos individuales.`, 'success');
    }
  }
</script>

<div class="toolbar-section" data-tour="advanced-section">
  <button class="section-toggle" onclick={() => showAdvanced = !showAdvanced}>
    {showAdvanced ? '▾' : '▸'} Análisis Avanzado
  </button>
  {#if showAdvanced}
  {#snippet helpPanel(key: string)}
    {#if advHelpKey === key && ADV_HELP[key]}
      <div class="adv-help-panel" style="grid-column: span 2">
        <strong>{ADV_HELP[key].label}</strong>
        <p>{ADV_HELP[key].text}</p>
      </div>
    {/if}
  {/snippet}
  <div class="advanced-grid">
    {#if uiStore.analysisMode !== '3d'}
    <div class="adv-btn-wrap" style="grid-column: span 2">
      <button class="adv-btn" style="flex:1"
        class:active={uiStore.showKinematicPanel}
        onclick={() => uiStore.showKinematicPanel = !uiStore.showKinematicPanel}>
        Análisis Cinemático
      </button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('kinematic', e)} class:active={advHelpKey === 'kinematic'}>?</button>
    </div>
    {@render helpPanel('kinematic')}
    {/if}
    <div class="adv-btn-wrap" style="grid-column: span 2">
      <button class="adv-btn" style="flex:1"
        class:active={uiStore.currentTool === 'select' && uiStore.selectMode === 'stress'}
        onclick={() => {
          if (!resultsStore.results && !resultsStore.results3D) { uiStore.toast('Calcul\u00e1 primero', 'error'); return; }
          uiStore.currentTool = 'select';
          uiStore.selectMode = 'stress';
        }}>
        Análisis de Sección
      </button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('stress', e)} class:active={advHelpKey === 'stress'}>?</button>
    </div>
    {@render helpPanel('stress')}
    {#if uiStore.analysisMode !== '3d'}
    <div class="adv-btn-wrap">
      <button class="adv-btn" class:active={!!resultsStore.pdeltaResult}
        onclick={() => {
          if (resultsStore.pdeltaResult) {
            resultsStore.clearPDelta();
            const r = modelStore.solve(uiStore.includeSelfWeight);
            if (r && typeof r !== 'string') resultsStore.setResults(r);
          } else { handlePDelta(); }
        }}>P-Δ (2° Orden)</button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('pdelta', e)} class:active={advHelpKey === 'pdelta'}>?</button>
    </div>
    <div class="adv-btn-wrap">
      <button class="adv-btn" class:active={!!resultsStore.bucklingResult}
        onclick={() => {
          if (resultsStore.bucklingResult) { resultsStore.clearBuckling(); }
          else { handleBuckling(); }
        }}>Pcr (Euler)</button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('buckling', e)} class:active={advHelpKey === 'buckling'}>?</button>
    </div>
    {@render helpPanel('pdelta')}
    {@render helpPanel('buckling')}
    <div class="adv-btn-wrap">
      <button class="adv-btn" class:active={!!resultsStore.modalResult}
        onclick={() => {
          if (resultsStore.modalResult) { resultsStore.clearModal(); }
          else { handleModal(); }
        }}>Dinámico</button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('modal', e)} class:active={advHelpKey === 'modal'}>?</button>
    </div>
    <div class="adv-btn-wrap">
      <button class="adv-btn" class:active={!!resultsStore.spectralResult}
        onclick={() => {
          if (resultsStore.spectralResult) { resultsStore.clearSpectral(); }
          else { handleSpectral(); }
        }}>Espectral</button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('spectral', e)} class:active={advHelpKey === 'spectral'}>?</button>
    </div>
    {@render helpPanel('modal')}
    {@render helpPanel('spectral')}
    <div class="adv-btn-wrap" style="grid-column: span 2">
      <button class="adv-btn" style="flex:1" class:active={!!resultsStore.plasticResult}
        onclick={() => {
          if (resultsStore.plasticResult) {
            resultsStore.clearPlastic();
            const r = modelStore.solve(uiStore.includeSelfWeight);
            if (r && typeof r !== 'string') resultsStore.setResults(r);
          } else { handlePlastic(); }
        }}>Colapso plástico</button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('plastic', e)} class:active={advHelpKey === 'plastic'}>?</button>
    </div>
    {@render helpPanel('plastic')}
    <div class="adv-btn-wrap" style="grid-column: span 2">
      <button class="adv-btn" style="flex:1"
        class:active={resultsStore.activeView === 'envelope'}
        onclick={() => {
          if (modelStore.model.combinations.length === 0) {
            uiStore.toast('Defin\u00ed combinaciones primero en la pesta\u00f1a Combinaciones', 'error');
            return;
          }
          if (!resultsStore.fullEnvelope) {
            handleSolveCombinations();
          }
          if (resultsStore.fullEnvelope) {
            resultsStore.activeView = 'envelope';
            if (resultsStore.diagramType === 'none' || resultsStore.diagramType === 'deformed') resultsStore.diagramType = 'moment';
          }
        }}>
        Envolvente
      </button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('envelope', e)} class:active={advHelpKey === 'envelope'}>?</button>
    </div>
    {@render helpPanel('envelope')}
    <div class="adv-btn-wrap" style="grid-column: span 2">
      <button class="adv-btn" style="flex:1" class:active={!!resultsStore.movingLoadEnvelope}
        onclick={() => {
          if (resultsStore.movingLoadEnvelope) {
            resultsStore.clearMovingLoad();
            const r = modelStore.solve(uiStore.includeSelfWeight);
            if (r && typeof r !== 'string') resultsStore.setResults(r);
            showTrainPanel = false;
          } else { showTrainPanel = !showTrainPanel; }
        }}>
        {showTrainPanel ? '▾' : '▸'} Tren de Carga
      </button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('trainLoad', e)} class:active={advHelpKey === 'trainLoad'}>?</button>
    </div>
    {@render helpPanel('trainLoad')}
    {#if showTrainPanel}
      <div class="envelope-sub-panel" style="grid-column: span 2">
        {#if resultsStore.movingLoadRunning}
          <div class="moving-load-progress">
            <div class="progress-bar-container">
              <div class="progress-bar-fill" style="width: {resultsStore.movingLoadProgress ? (resultsStore.movingLoadProgress.current / Math.max(resultsStore.movingLoadProgress.total, 1) * 100) : 0}%"></div>
            </div>
            <div class="progress-info">
              <span class="progress-text">
                {resultsStore.movingLoadProgress?.current ?? 0}/{resultsStore.movingLoadProgress?.total ?? '?'} posiciones
              </span>
              <button class="cancel-btn" onclick={() => resultsStore.cancelMovingLoad()}>
                Cancelar
              </button>
            </div>
          </div>
        {:else}
          <div class="adv-btn-wrap">
            <select class="adv-select" bind:value={selectedTrainIndex} onchange={() => { if (selectedTrainIndex !== '') handleMovingLoad(Number(selectedTrainIndex)); }}>
              <option value="">Seleccionar tren...</option>
              {#each PREDEFINED_TRAINS as train, i}
                <option value={String(i)}>{train.name}</option>
              {/each}
            </select>
          </div>
        {/if}
      </div>
    {/if}
    <div class="adv-btn-wrap" style="grid-column: span 2">
      <button class="adv-btn" style="flex:1"
        class:active={uiStore.currentTool === 'influenceLine'}
        onclick={() => { uiStore.currentTool = uiStore.currentTool === 'influenceLine' ? 'select' : 'influenceLine'; }}>
        ⌇ Línea de Influencia
      </button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('influenceLine', e)} class:active={advHelpKey === 'influenceLine'}>?</button>
    </div>
    {@render helpPanel('influenceLine')}
    {/if}
    <div class="adv-btn-wrap" style="grid-column: span 2">
        <button class="adv-btn" style="flex:1"
          class:active={uiStore.showWhatIf}
          onclick={() => {
            if (!resultsStore.results && !resultsStore.results3D) {
              uiStore.toast('Calcul\u00e1 primero (F5)', 'error');
              return;
            }
            uiStore.showWhatIf = !uiStore.showWhatIf;
          }}
        >
          {uiStore.showWhatIf ? '\u2715 Cerrar explorador' : 'Explorar (\u00bfQu\u00e9 pasa si\u2026?)'}
        </button>
        <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('whatif', e)} class:active={advHelpKey === 'whatif'}>?</button>
      </div>
      {@render helpPanel('whatif')}
    <div class="adv-btn-wrap" style="grid-column: span 2">
      <button class="adv-btn" style="flex:1" class:active={dsmStepsStore.isOpen}
        onclick={() => {
          if (dsmStepsStore.isOpen) {
            dsmStepsStore.close();
            setTimeout(() => window.dispatchEvent(new Event('dedaliano-zoom-to-fit')), 100);
            return;
          }
          if (uiStore.analysisMode === '3d') {
            const input = modelStore.buildSolverInput3D(uiStore.includeSelfWeight, uiStore.axisConvention3D === 'leftHand');
            if (!input) { uiStore.toast('Modelo vac\u00edo', 'error'); return; }
            try {
              const data = solveDetailed3D(input);
              dsmStepsStore.setStepData(data);
              dsmStepsStore.open();
              if (uiStore.isMobile) uiStore.rightDrawerOpen = true;
              else uiStore.rightSidebarOpen = true;
              setTimeout(() => window.dispatchEvent(new Event('dedaliano-zoom-to-fit')), 100);
            } catch (e: any) {
              uiStore.toast(e.message || 'Error en solver detallado 3D', 'error');
            }
          } else {
            const input = modelStore.buildSolverInput(uiStore.includeSelfWeight);
            if (!input) { uiStore.toast('Modelo vac\u00edo', 'error'); return; }
            try {
              const data = solveDetailed(input);
              dsmStepsStore.setStepData(data);
              dsmStepsStore.open();
              if (uiStore.isMobile) uiStore.rightDrawerOpen = true;
              else uiStore.rightSidebarOpen = true;
              setTimeout(() => window.dispatchEvent(new Event('dedaliano-zoom-to-fit')), 100);
            } catch (e: any) {
              uiStore.toast(e.message || 'Error en solver detallado', 'error');
            }
          }
        }}>
        Paso a Paso — Mét. Rigideces
      </button>
      <button class="adv-help-btn" onclick={(e) => toggleAdvHelp('dsm', e)} class:active={advHelpKey === 'dsm'}>?</button>
    </div>
    {@render helpPanel('dsm')}
  </div>
  {#if resultsStore.pdeltaResult}
    <div class="adv-result-info" style="font-size:10px">
      P-Δ: B₂ = {resultsStore.pdeltaResult.b2Factor.toFixed(3)} |
      {resultsStore.pdeltaResult.converged ? `${resultsStore.pdeltaResult.iterations} iter` : 'no conv.'} |
      {resultsStore.pdeltaResult.isStable ? 'estable' : 'inestable'}
    </div>
  {/if}
  {#if resultsStore.modalResult}
    <div class="adv-result-row">
      <button class="adv-result-btn" class:active={resultsStore.diagramType === 'modeShape'} onclick={() => resultsStore.diagramType = 'modeShape'}>Dinámico</button>
      <button class="small-btn" onclick={() => { if (resultsStore.activeModeIndex > 0) resultsStore.activeModeIndex--; }} disabled={resultsStore.activeModeIndex === 0}>&#9664;</button>
      <span class="adv-result-label">{resultsStore.activeModeIndex + 1}/{resultsStore.modalResult.modes.length}</span>
      <button class="small-btn" onclick={() => { if (resultsStore.modalResult && resultsStore.activeModeIndex < resultsStore.modalResult.modes.length - 1) resultsStore.activeModeIndex++; }} disabled={!resultsStore.modalResult || resultsStore.activeModeIndex >= resultsStore.modalResult.modes.length - 1}>&#9654;</button>
    </div>
    {#if resultsStore.modalResult.modes[resultsStore.activeModeIndex]}
      {@const mode = resultsStore.modalResult.modes[resultsStore.activeModeIndex]}
      <div class="adv-result-info">
        f = {mode.frequency.toFixed(2)} Hz |
        T = {mode.period.toFixed(3)} s
      </div>
      <div class="adv-result-info" style="font-size:10px; opacity:0.8">
        Meff: X={( mode.massRatioX * 100).toFixed(1)}% Y={( mode.massRatioY * 100).toFixed(1)}% |
        Σ: X={( resultsStore.modalResult.cumulativeMassRatioX * 100).toFixed(1)}% Y={( resultsStore.modalResult.cumulativeMassRatioY * 100).toFixed(1)}%
      </div>
    {/if}
  {/if}
  {#if resultsStore.spectralResult}
    <div class="adv-result-info" style="font-size:10px">
      Espectral ({resultsStore.spectralResult.rule}):
      V<sub>base</sub> = {resultsStore.spectralResult.baseShear.toFixed(1)} kN
    </div>
    <div class="adv-result-info" style="font-size:9px; opacity:0.8">
      {#each resultsStore.spectralResult.perMode.slice(0, 3) as pm}
        T<sub>{pm.mode}</sub>={pm.period.toFixed(3)}s Sa={pm.sa.toFixed(2)}g{' | '}
      {/each}
      {#if resultsStore.spectralResult.perMode.length > 3}…{/if}
    </div>
  {/if}
  {#if resultsStore.bucklingResult}
    <div class="adv-result-row">
      <button class="adv-result-btn" class:active={resultsStore.diagramType === 'bucklingMode'} onclick={() => resultsStore.diagramType = 'bucklingMode'}>Pandeo</button>
      <button class="small-btn" onclick={() => { if (resultsStore.activeBucklingMode > 0) resultsStore.activeBucklingMode--; }} disabled={resultsStore.activeBucklingMode === 0}>&#9664;</button>
      <span class="adv-result-label">{resultsStore.activeBucklingMode + 1}/{resultsStore.bucklingResult.modes.length}</span>
      <button class="small-btn" onclick={() => { if (resultsStore.bucklingResult && resultsStore.activeBucklingMode < resultsStore.bucklingResult.modes.length - 1) resultsStore.activeBucklingMode++; }} disabled={!resultsStore.bucklingResult || resultsStore.activeBucklingMode >= resultsStore.bucklingResult.modes.length - 1}>&#9654;</button>
    </div>
    <div class="adv-result-info">
      &lambda;_cr = {resultsStore.bucklingResult.modes[resultsStore.activeBucklingMode]?.loadFactor.toFixed(3) ?? '—'}
    </div>
    {#if resultsStore.bucklingResult.elementData.length > 0}
      <div class="adv-result-info" style="font-size:10px; opacity:0.8">
        Keff: {resultsStore.bucklingResult.elementData.slice(0, 3).map(ed => `E${ed.elementId}=${ed.kEffective.toFixed(2)}`).join(', ')}{resultsStore.bucklingResult.elementData.length > 3 ? '...' : ''}
      </div>
    {/if}
  {/if}
  {#if resultsStore.plasticResult}
    <div class="adv-result-row">
      <button class="adv-result-btn" class:active={resultsStore.diagramType === 'plasticHinges'} onclick={() => resultsStore.diagramType = 'plasticHinges'}>Plástico</button>
      <button class="small-btn" onclick={() => { if (resultsStore.plasticStep > 0) resultsStore.plasticStep--; }} disabled={resultsStore.plasticStep === 0}>&#9664;</button>
      <span class="adv-result-label">{resultsStore.plasticStep + 1}/{resultsStore.plasticResult.steps.length}</span>
      <button class="small-btn" onclick={() => { if (resultsStore.plasticResult && resultsStore.plasticStep < resultsStore.plasticResult.steps.length - 1) resultsStore.plasticStep++; }} disabled={!resultsStore.plasticResult || resultsStore.plasticStep >= resultsStore.plasticResult.steps.length - 1}>&#9654;</button>
    </div>
    <div class="adv-result-info">
      &lambda; = {resultsStore.plasticResult.steps[resultsStore.plasticStep]?.loadFactor.toFixed(3) ?? '—'} |
      {resultsStore.plasticResult.isMechanism ? 'Mecanismo' : 'Sin colapso'} |
      GH = {resultsStore.plasticResult.redundancy}
    </div>
  {/if}
  {#if resultsStore.movingLoadEnvelope}
    <div class="adv-result-row">
      <button class="adv-result-btn" class:active={!resultsStore.movingLoadShowEnvelope} onclick={() => { resultsStore.movingLoadShowEnvelope = false; resultsStore.diagramType = 'moment'; }}>Carga Móvil</button>
      <button class="small-btn" onclick={() => { if (resultsStore.activeMovingLoadPosition > 0) { resultsStore.activeMovingLoadPosition--; resultsStore.movingLoadShowEnvelope = false; } }} disabled={resultsStore.activeMovingLoadPosition === 0}>&#9664;</button>
      <span class="adv-result-label">{resultsStore.activeMovingLoadPosition + 1}/{resultsStore.movingLoadEnvelope.positions.length}</span>
      <button class="small-btn" onclick={() => { if (resultsStore.movingLoadEnvelope && resultsStore.activeMovingLoadPosition < resultsStore.movingLoadEnvelope.positions.length - 1) { resultsStore.activeMovingLoadPosition++; resultsStore.movingLoadShowEnvelope = false; } }} disabled={!resultsStore.movingLoadEnvelope || resultsStore.activeMovingLoadPosition >= resultsStore.movingLoadEnvelope.positions.length - 1}>&#9654;</button>
    </div>
    <div class="adv-result-info">
      Posición: {resultsStore.movingLoadEnvelope.positions[resultsStore.activeMovingLoadPosition]?.refPosition.toFixed(2) ?? '—'} m
    </div>
    {#if resultsStore.movingLoadEnvelope.fullEnvelope}
      <button class="adv-result-btn small" class:active={resultsStore.movingLoadShowEnvelope}
        onclick={() => {
          resultsStore.movingLoadShowEnvelope = !resultsStore.movingLoadShowEnvelope;
          if (resultsStore.movingLoadShowEnvelope) {
            // Show envelope of all positions -- switch to moment diagram
            const dt = resultsStore.diagramType;
            if (dt !== 'moment' && dt !== 'shear' && dt !== 'axial') {
              resultsStore.diagramType = 'moment';
            }
          }
        }}>
        {resultsStore.movingLoadShowEnvelope ? '▾' : '▸'} Ver envolvente
      </button>
    {/if}
  {/if}
  {/if}
</div>

<style>
  .toolbar-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .section-toggle {
    width: 100%;
    padding: 0.4rem 0.5rem;
    background: none;
    border: 1px solid #333;
    border-radius: 4px;
    color: #aaa;
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 600;
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    transition: all 0.2s;
  }

  .section-toggle:hover {
    background: #1a1a2e;
    color: #ccc;
    border-color: #555;
  }

  .advanced-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem;
  }

  .adv-btn-wrap {
    display: flex;
    align-items: stretch;
    gap: 4px;
  }

  .adv-btn {
    padding: 0.3rem 0.4rem;
    min-height: 28px;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    background: #0f3460;
    color: #4ecdc4;
    font-size: 0.72rem;
    cursor: pointer;
    text-align: center;
    flex: 1;
    transition: all 0.2s;
  }

  .adv-btn:hover {
    background: #1a4a7a;
    color: white;
  }

  .adv-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .adv-btn.active {
    background: #1a4a7a;
    color: #4ecdc4;
    border-color: #4ecdc4;
  }

  .adv-help-btn {
    width: 20px;
    min-width: 20px;
    padding: 0;
    border: 1px solid #1a4a7a;
    border-radius: 50%;
    background: #0f3460;
    color: #888;
    font-size: 0.65rem;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .adv-help-btn:hover,
  .adv-help-btn.active {
    background: #4ecdc4;
    color: #0a1628;
    border-color: #4ecdc4;
  }

  .adv-help-panel {
    padding: 6px 8px;
    background: rgba(78, 205, 196, 0.08);
    border: 1px solid rgba(78, 205, 196, 0.3);
    border-radius: 6px;
    font-size: 0.7rem;
    line-height: 1.4;
    color: #ccc;
  }

  .adv-help-panel strong {
    color: #4ecdc4;
    font-size: 0.72rem;
  }

  .adv-help-panel p {
    margin: 4px 0 0;
    color: #aaa;
  }

  .envelope-sub-panel {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-left: 12px;
    border-left: 2px solid #4ecdc4;
    margin-top: 4px;
  }

  .moving-load-progress {
    padding: 0.2rem 0;
  }
  .progress-bar-container {
    width: 100%;
    height: 6px;
    background: #333;
    border-radius: 3px;
    overflow: hidden;
  }
  .progress-bar-fill {
    height: 100%;
    background: #4ecdc4;
    border-radius: 3px;
    transition: width 0.15s ease-out;
  }
  .progress-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.2rem;
  }
  .progress-text {
    font-size: 0.68rem;
    color: #4ecdc4;
  }
  .cancel-btn {
    padding: 0.15rem 0.5rem;
    border: 1px solid #e94560;
    border-radius: 3px;
    background: transparent;
    color: #e94560;
    font-size: 0.68rem;
    cursor: pointer;
  }
  .cancel-btn:hover {
    background: #e94560;
    color: white;
  }

  .adv-select {
    flex: 1;
    padding: 0.3rem 0.4rem;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    background: #0f3460;
    color: #4ecdc4;
    font-size: 0.72rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .adv-select:hover {
    background: #1a4a7a;
    color: white;
  }

  .small-btn {
    padding: 0.1rem 0.4rem;
    border: 1px solid #555;
    border-radius: 3px;
    background: #2a2a2a;
    color: #ccc;
    font-size: 0.7rem;
    cursor: pointer;
  }

  .small-btn:hover:not(:disabled) {
    background: #3a3a3a;
    color: white;
  }

  .small-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .adv-result-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-top: 0.25rem;
  }

  .adv-result-btn {
    padding: 0.2rem 0.5rem;
    border: 1px solid #555;
    border-radius: 4px;
    background: #2a2a2a;
    color: #ccc;
    font-size: 0.72rem;
    cursor: pointer;
    flex-shrink: 0;
  }

  .adv-result-btn:hover {
    background: #3a3a3a;
    color: white;
  }

  .adv-result-btn.active {
    background: #e94560;
    border-color: #ff6b6b;
    color: white;
  }

  .adv-result-label {
    font-size: 0.72rem;
    color: #4ecdc4;
    min-width: 2rem;
    text-align: center;
  }

  .adv-result-info {
    font-size: 0.68rem;
    color: #888;
    padding: 0 0 0 0.25rem;
  }
</style>
