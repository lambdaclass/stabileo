<script lang="ts">
  import { uiStore } from '../lib/store';
</script>

{#if uiStore.showHelp}
  <div class="help-overlay" role="dialog" aria-label="Atajos de teclado">
    <div class="help-backdrop" onclick={() => uiStore.showHelp = false}></div>
    <div class="help-content">
      <div class="help-header">
        <h2>Atajos de Teclado</h2>
        <button class="help-close" onclick={() => uiStore.showHelp = false}>✕</button>
      </div>
      <div class="help-columns">
        <div class="help-col">
          <h3>Herramientas</h3>
          <div class="shortcut"><kbd>V</kbd> Seleccionar</div>
          <div class="shortcut"><kbd>N</kbd> Nodo</div>
          <div class="shortcut"><kbd>E</kbd> Elemento</div>
          <div class="shortcut"><kbd>S</kbd> Apoyo</div>
          <div class="shortcut"><kbd>L</kbd> Carga</div>
          <div class="shortcut"><kbd>A</kbd> Mover (pan)</div>
          <h3>Edición</h3>
          <div class="shortcut"><kbd>Ctrl+Z</kbd> Deshacer</div>
          <div class="shortcut"><kbd>Ctrl+Y</kbd> Rehacer</div>
          <div class="shortcut"><kbd>Ctrl+A</kbd> Seleccionar todo</div>
          <div class="shortcut"><kbd>Ctrl+C</kbd> Copiar</div>
          <div class="shortcut"><kbd>Ctrl+X</kbd> Cortar</div>
          <div class="shortcut"><kbd>Ctrl+V</kbd> Pegar</div>
          <div class="shortcut"><kbd>Del</kbd> Eliminar</div>
        </div>
        <div class="help-col">
          <h3>Vista</h3>
          <div class="shortcut"><kbd>G</kbd> Mostrar/Ocultar grilla</div>
          <div class="shortcut"><kbd>H</kbd> Mostrar/Ocultar ejes</div>
          <div class="shortcut"><kbd>F</kbd> Encuadrar modelo</div>
          {#if uiStore.analysisMode !== '3d'}
            <div class="shortcut"><kbd>+</kbd> Acercar</div>
            <div class="shortcut"><kbd>-</kbd> Alejar</div>
          {/if}
          <div class="shortcut"><kbd>Esc</kbd> Cancelar / Deseleccionar</div>
          <h3>Diagramas (con resultados)</h3>
          <div class="shortcut"><kbd>0</kbd> Ninguno</div>
          <div class="shortcut"><kbd>1</kbd> Deformada</div>
          {#if uiStore.analysisMode !== '3d'}
            <div class="shortcut"><kbd>2</kbd> Corte</div>
            <div class="shortcut"><kbd>3</kbd> Momento</div>
          {:else}
            <div class="shortcut"><kbd>2</kbd> Corte Z</div>
            <div class="shortcut"><kbd>3</kbd> Momento Y</div>
            <div class="shortcut"><kbd>4</kbd> Corte Y</div>
            <div class="shortcut"><kbd>5</kbd> Momento Z</div>
            <div class="shortcut"><kbd>6</kbd> Torsor</div>
          {/if}
          <div class="shortcut"><kbd>7</kbd> Axil</div>
          <div class="shortcut"><kbd>8</kbd> Axil colores</div>
          <div class="shortcut"><kbd>9</kbd> Color map</div>
          <h3>Archivo / Cálculo</h3>
          <div class="shortcut"><kbd>Ctrl+S</kbd> Guardar pestaña</div>
          <div class="shortcut"><kbd>Ctrl+Shift+S</kbd> Guardar sesión</div>
          <div class="shortcut"><kbd>Ctrl+O</kbd> Abrir</div>
          <div class="shortcut"><kbd>Enter</kbd> Calcular</div>
        </div>
      </div>
      <p class="help-hint">Presioná <kbd>?</kbd> para cerrar</p>
    </div>
  </div>
{/if}

<style>
  .help-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .help-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
  }

  .help-content {
    position: relative;
    background: #16213e;
    border: 1px solid #0f3460;
    border-radius: 8px;
    padding: 1.5rem 2rem;
    max-width: 600px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }

  .help-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .help-header h2 {
    font-size: 1.1rem;
    color: #4ecdc4;
    margin: 0;
  }

  .help-close {
    background: none;
    border: none;
    color: #888;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0.25rem;
  }

  .help-close:hover {
    color: #eee;
  }

  .help-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
  }

  .help-col h3 {
    font-size: 0.75rem;
    text-transform: uppercase;
    color: #888;
    letter-spacing: 0.05em;
    margin: 0.75rem 0 0.4rem 0;
  }

  .help-col h3:first-child {
    margin-top: 0;
  }

  .shortcut {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: #ccc;
    padding: 0.15rem 0;
  }

  .help-content :global(kbd) {
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 3px;
    padding: 0.1rem 0.4rem;
    font-family: monospace;
    font-size: 0.75rem;
    color: #e94560;
    min-width: 1.5rem;
    text-align: center;
  }

  .help-hint {
    text-align: center;
    color: #666;
    font-size: 0.75rem;
    margin-top: 1rem;
    margin-bottom: 0;
  }

  @media (max-width: 767px) {
    .help-columns {
      grid-template-columns: 1fr;
      gap: 0.5rem;
    }

    .help-content {
      padding: 1rem;
      max-width: 95%;
    }
  }
</style>
