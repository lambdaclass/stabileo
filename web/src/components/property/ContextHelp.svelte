<script lang="ts">
  import { modelStore, uiStore, resultsStore } from '../../lib/store';

  const CONTEXTUAL_HELP: Record<string, { title: string; steps: string[]; tip: string }> = {
    'no-model': {
      title: 'Primeros pasos',
      steps: ['1. Creá nodos', '2. Conectalos con barras', '3. Agregá apoyos', '4. Aplicá cargas', '5. Presioná Calcular', '6. Explorá los diagramas'],
      tip: 'Probá cargando un ejemplo del menú "Ejemplos" en el panel izquierdo.',
    },
    'node': {
      title: 'Crear Nodos',
      steps: ['Click en el lienzo para colocar un nodo', 'Los nodos se ubican en la grilla si snap está activo', 'Cada nodo tiene 3 grados de libertad: ux, uy, θz'],
      tip: 'Tip: Usá la grilla (G) para alinear nodos. Doble click en un nodo para editar coordenadas.',
    },
    'element': {
      title: 'Crear Elementos',
      steps: ['Click en el nodo de inicio', 'Click en el nodo de fin', 'Se crea una barra entre ambos'],
      tip: 'Frame = barra rígida (transmite momento). Truss = articulada (solo axil). Podés cambiar después.',
    },
    'support': {
      title: 'Crear Apoyos',
      steps: ['Elegí el tipo de apoyo en el panel', 'Click en un nodo para colocarlo'],
      tip: 'Empotrado: bloquea todo. Articulado: permite giro. Móvil: permite desplazamiento en una dirección.',
    },
    'load': {
      title: 'Aplicar Cargas',
      steps: ['Elegí el tipo de carga', 'Configurá el valor (negativo = hacia abajo)', 'Click en nodo o barra según el tipo'],
      tip: 'Distribuida: se aplica sobre una barra. Puntual en barra: se aplica en un punto intermedio.',
    },
    'select': {
      title: 'Seleccionar',
      steps: ['Click en un nodo o barra para seleccionar', 'Shift+click para agregar a la selección', 'Arrastrá un nodo para moverlo'],
      tip: 'Delete o Backspace para eliminar lo seleccionado. Ctrl+A selecciona todo.',
    },
    'influenceLine': {
      title: 'Línea de Influencia',
      steps: ['Elegí la magnitud a analizar (Ry, M, V...)', 'Click en el nodo o sección de interés', 'Se dibuja la línea de influencia'],
      tip: 'Muestra cómo varía la magnitud cuando una carga unitaria recorre la estructura.',
    },
    'pan': {
      title: 'Mover Vista',
      steps: ['Arrastrá para desplazar', '+/- para zoom', 'F para encuadrar todo'],
      tip: 'También podés hacer zoom con la rueda del mouse y pan con click medio.',
    },
    'results': {
      title: 'Resultados',
      steps: ['Elegí un diagrama: M, V, N, deformada...', 'Seleccioná nodos o barras para ver valores', 'Ajustá la escala del diagrama'],
      tip: 'Usá los números 0-5 como atajos para cambiar de diagrama rápidamente.',
    },
  };

  const helpContext = $derived.by(() => {
    const n = modelStore.nodes.size;
    const e = modelStore.elements.size;
    if (n === 0 && e === 0) return CONTEXTUAL_HELP['no-model'];
    if (resultsStore.results && uiStore.currentTool === 'select') return CONTEXTUAL_HELP['results'];
    return CONTEXTUAL_HELP[uiStore.currentTool] ?? CONTEXTUAL_HELP['select'];
  });
</script>

{#if uiStore.showHelpPanel && helpContext}
  <div class="help-panel">
    <h3 class="help-title">{helpContext.title}</h3>
    <ul class="help-steps">
      {#each helpContext.steps as step}
        <li>{step}</li>
      {/each}
    </ul>
    <p class="help-tip">{helpContext.tip}</p>
  </div>
{/if}

<style>
  .help-panel {
    background: #1a2a3e;
    border: 1px solid #2a4a6e;
    border-radius: 6px;
    padding: 0.75rem;
    margin-top: 0.5rem;
  }

  .help-title {
    font-size: 0.8rem;
    color: #4ecdc4;
    font-weight: 700;
    text-transform: none;
    letter-spacing: 0;
    margin-bottom: 0.5rem;
  }

  .help-steps {
    list-style: none;
    padding: 0;
    margin: 0 0 0.5rem 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .help-steps li {
    font-size: 0.75rem;
    color: #bbb;
    padding-left: 0.5rem;
    border-left: 2px solid #2a4a6e;
  }

  .help-tip {
    font-size: 0.72rem;
    color: #f0a500;
    font-style: italic;
    margin: 0;
    padding-top: 0.25rem;
    border-top: 1px solid #2a4a6e;
  }
</style>
