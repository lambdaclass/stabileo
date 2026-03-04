// Tour step definitions for the /demo guided walkthrough
import type { TourStep, TourActionButton } from '../store/tour.svelte';
import { uiStore, modelStore, resultsStore } from '../store';

/** Load an example and clean up results (same logic as ToolbarExamples) */
function loadExampleAndZoom(exampleId: string) {
  modelStore.loadExample(exampleId);
  resultsStore.clear();
  resultsStore.clear3D();
  setTimeout(() => window.dispatchEvent(new Event('dedaliano-zoom-to-fit')), 50);
}

/** Trigger the solve flow via the global event (same as Enter key / mobile panel) */
function triggerSolve() {
  window.dispatchEvent(new Event('dedaliano-solve'));
}

export function buildTourSteps(): TourStep[] {
  const is3D = () => uiStore.analysisMode === '3d';

  return [
    // ─── 0: Welcome ───
    {
      id: 'welcome',
      target: 'none',
      title: 'Bienvenido a Dedaliano',
      description:
        'Un programa de cálculo estructural gratuito.' +
        '<br/><br/>' +
        'En esta guía rápida vas a aprender a armar y calcular una estructura en pocos pasos.',
      position: 'center',
    },

    // ─── 1: Mode toggle ───
    {
      id: 'mode-toggle',
      target: '[data-tour="mode-toggle"]',
      title: 'Elegí tu modo de análisis',
      description:
        '<strong>2D</strong> — Pórticos, vigas y reticulados planos.' +
        '<br/>' +
        '<strong>3D</strong> — Estructuras espaciales con 6 grados de libertad por nodo.' +
        '<br/><br/>' +
        'Hacé click en el que prefieras, o usá los botones de abajo.',
      position: 'bottom',
      allowInteraction: true,
      multiAction: [
        {
          label: '2D',
          action: () => { uiStore.analysisMode = '2d'; },
          advanceAfter: true,
        },
        {
          label: '3D',
          action: () => { uiStore.analysisMode = '3d'; },
          advanceAfter: true,
        },
      ],
    },

    // ─── 2: Build options ───
    {
      id: 'build-options',
      target: '[data-tour="floating-tools"]',
      title: 'Armá tu estructura',
      description:
        'Tenés tres formas de crear un modelo:' +
        '<br/><br/>' +
        '&#x2022; <strong>Herramientas</strong> — Dibujá nodos, barras, apoyos y cargas como en Paint' +
        '<br/>' +
        '&#x2022; <strong>Panel lateral derecho</strong> — Ingresá datos numéricos directamente' +
        '<br/>' +
        '&#x2022; <strong>Ejemplos precargados</strong> — La forma más rápida de empezar' +
        '<br/><br/>' +
        'Te recomendamos arrancar con un ejemplo. Vamos a eso &#x2192;',
      position: 'bottom',
      highlightPadding: 4,
      onEnter: () => {
        if (!uiStore.showFloatingTools) uiStore.showFloatingTools = true;
      },
    },

    // ─── 3: Load example ───
    {
      id: 'examples',
      target: '[data-tour="examples-section"]',
      title: 'Cargá un ejemplo',
      get description() {
        if (is3D()) {
          return (
            'Elegí cualquier ejemplo para cargarlo al instante.' +
            '<br/><br/>' +
            'Podés calcular todos los modelos que tiene Dedaliano 2D (menos los reticulados).' +
            '<br/><br/>' +
            'Y también hay <strong>Ejemplos 3D</strong> para aprovechar las tres dimensiones.' +
            '<br/><br/>' +
            'O usá el botón de abajo para cargar el recomendado.'
          );
        }
        return (
          'Elegí cualquier ejemplo para cargarlo al instante.' +
          '<br/><br/>' +
          'O usá el botón de abajo para cargar el recomendado.'
        );
      },
      position: 'right',
      allowInteraction: true,
      get actionButton(): TourActionButton {
        return {
          label: is3D() ? 'Pórtico 3D' : 'Ejemplo Pórtico',
          action: () => loadExampleAndZoom(is3D() ? '3d-portal-frame' : 'portal-frame'),
          advanceAfter: true,
        };
      },
      onEnter: () => {
        if (uiStore.isMobile) {
          uiStore.leftDrawerOpen = true;
        } else if (!uiStore.leftSidebarOpen) {
          uiStore.leftSidebarOpen = true;
        }
        setTimeout(() => {
          const el = document.querySelector('[data-tour="examples-section"]');
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      },
      onExit: () => {
        if (uiStore.isMobile) uiStore.leftDrawerOpen = false;
      },
      waitFor: () => modelStore.nodes.size > 0,
    },

    // ─── 4: Manual tools hint ───
    {
      id: 'manual-tools',
      target: '[data-tour="floating-tools"]',
      title: 'Creación manual',
      get description() {
        const m = uiStore.isMobile;
        return (
          'Si preferís armar todo a mano, seguí este orden:' +
          '<br/><br/>' +
          `<strong>1.</strong> ${m ? '● ' : ''}Nodo${m ? '' : ' (N)'} — Colocá puntos en el lienzo` +
          '<br/>' +
          `<strong>2.</strong> ${m ? '— ' : ''}Elemento${m ? '' : ' (E)'} — Conectá dos nodos con una barra` +
          '<br/>' +
          `<strong>3.</strong> ${m ? '▽ ' : ''}Apoyo${m ? '' : ' (S)'} — Restringí los movimientos de un nodo` +
          '<br/>' +
          `<strong>4.</strong> ${m ? '↓ ' : ''}Carga${m ? '' : ' (L)'} — Aplicá fuerzas o cargas distribuidas` +
          '<br/><br/>' +
          'También podés cambiar <strong>materiales</strong> y <strong>secciones</strong> desde el panel lateral derecho.'
        );
      },
      position: 'bottom',
      highlightPadding: 4,
      allowInteraction: true,
      onEnter: () => {
        if (uiStore.isMobile) uiStore.leftDrawerOpen = false;
        if (!uiStore.showFloatingTools) uiStore.showFloatingTools = true;
      },
    },

    // ─── 5: Right panel ───
    {
      id: 'right-panel',
      target: '[data-tour="right-sidebar"]',
      title: 'Panel lateral derecho',
      description:
        'Acá podés ver y editar todos los datos del modelo:' +
        '<br/><br/>' +
        '&#x2022; <strong>Nodos</strong> — Coordenadas de cada punto' +
        '<br/>' +
        '&#x2022; <strong>Elementos</strong> — Barras con su material y sección' +
        '<br/>' +
        '&#x2022; <strong>Materiales</strong> — Propiedades como E, ν, fy' +
        '<br/>' +
        '&#x2022; <strong>Secciones</strong> — Elegí un perfil comercial o armá tu propia sección a medida' +
        '<br/>' +
        '&#x2022; <strong>Apoyos</strong> — Tipo y restricciones de cada apoyo' +
        '<br/>' +
        '&#x2022; <strong>Cargas</strong> — Fuerzas y cargas distribuidas aplicadas' +
        '<br/>' +
        '&#x2022; <strong>Combinaciones</strong> — Combinaciones de carga' +
        '<br/>' +
        '&#x2022; <strong>Resultados</strong> — Aparece después de calcular' +
        '<br/><br/>' +
        'Hacé click en cualquier campo para editarlo directamente.',
      position: 'left',
      highlightPadding: 4,
      allowInteraction: true,
      onEnter: () => {
        if (uiStore.isMobile) {
          uiStore.leftDrawerOpen = false;
          uiStore.rightDrawerOpen = true;
        } else {
          if (!uiStore.rightSidebarOpen) uiStore.rightSidebarOpen = true;
        }
      },
      onExit: () => {
        if (uiStore.isMobile) {
          uiStore.rightDrawerOpen = false;
        } else {
          uiStore.rightSidebarOpen = false;
        }
      },
    },

    // ─── 6: Calcular ───
    {
      id: 'calcular',
      target: '[data-tour="calcular-btn"]',
      title: '¡Calculá!',
      description:
        'Cuando la estructura tenga nodos, barras, apoyos y al menos una carga, presioná <strong>Calcular</strong>.' +
        '<br/><br/>' +
        'Resuelve por el <strong>Método de las Rigideces</strong>.' +
        '<br/><br/>' +
        'Usá el botón de abajo o el de la barra lateral.',
      position: 'right',
      allowInteraction: true,
      autoAdvance: true,
      actionButton: {
        label: 'Calcular',
        action: () => triggerSolve(),
        advanceAfter: false, // autoAdvance handles it when results arrive
      },
      onEnter: () => {
        if (uiStore.isMobile) {
          uiStore.rightDrawerOpen = false;
          uiStore.leftDrawerOpen = true;
        } else {
          if (!uiStore.leftSidebarOpen) uiStore.leftSidebarOpen = true;
        }
        setTimeout(() => {
          const el = document.querySelector('[data-tour="calcular-btn"]');
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      },
      waitFor: () => resultsStore.results !== null || resultsStore.results3D !== null,
    },

    // ─── 7: Results overview ───
    {
      id: 'results',
      target: '[data-tour="results-section"]',
      title: 'Resultados',
      description:
        'Acá podés ver los resultados del cálculo:' +
        '<br/><br/>' +
        '<strong>Deformada</strong> — Forma deformada amplificada de la estructura' +
        '<br/>' +
        '<strong>Momento / Corte / Axil</strong> — Diagramas de esfuerzos característicos en cada barra' +
        '<br/>' +
        '<strong>Axil colores</strong> — Tracción (rojo) vs compresión (azul), útil para reticulados' +
        '<br/>' +
        '<strong>Color map</strong> — Mapa de calor según la intensidad de cada esfuerzo' +
        '<br/><br/>' +
        'Probá cambiar entre ellos para explorar.',
      position: 'right',
      allowInteraction: true,
      highlightPadding: 4,
      onEnter: () => {
        if (uiStore.isMobile) {
          uiStore.leftDrawerOpen = true;
        }
        setTimeout(() => {
          const el = document.querySelector('[data-tour="results-section"]');
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      },
    },

    // ─── 8: Navigate model ───
    {
      id: 'navigate-model',
      target: 'none',
      title: 'Navegá el modelo',
      get description() {
        const m = uiStore.isMobile;
        let text: string;
        if (m) {
          text =
            'Usá dos dedos para <strong>moverte</strong> y hacer <strong>zoom</strong>.' +
            '<br/><br/>' +
            'Arriba a la derecha podés tocar <strong>&#x229E;</strong> para encuadrar el modelo en tu pantalla.' +
            '<br/><br/>' +
            'Presioná el botón <strong>📊</strong> arriba a la izquierda para abrir un panel flotante con los resultados y diagramas.';
        } else {
          text =
            'Con la herramienta <strong>Mover</strong> arrastrá el mouse para moverte por el lienzo.' +
            '<br/>' +
            'Usá la rueda para hacer zoom.' +
            '<br/><br/>' +
            'Arriba a la derecha podés clickear en <strong>&#x229E;</strong> para encuadrar el modelo en tu pantalla.';
        }
        if (is3D()) {
          text +=
            '<br/><br/>' +
            'Debajo de esa opción hay más herramientas: vistas predefinidas (planta, frente, lateral), perspectiva/ortográfica, plano de corte y medición.';
        }
        return text;
      },
      position: 'center',
      overlayOpacity: 0.25,
      allowInteraction: true,
      cardPosition: { x: 24, y: 60 },
      onEnter: () => {
        if (uiStore.isMobile) {
          uiStore.leftDrawerOpen = false;
          uiStore.rightDrawerOpen = false;
          // Show the minimized results button (📊) so user sees it
          uiStore.mobileResultsPanelOpen = false;
        }
        // Set pan tool so user can explore freely
        uiStore.currentTool = 'pan';
      },
    },

    // ─── 9: Query results ───
    {
      id: 'query-results',
      target: '[data-tour="floating-tools"]',
      title: 'Consultá resultados puntuales',
      get description() {
        if (uiStore.isMobile) {
          return (
            'Activá la herramienta <strong>↖ Seleccionar</strong> en modo <strong>Tensiones</strong> para ver los esfuerzos al tocar una barra.' +
            '<br/><br/>' +
            'O simplemente acercá el dedo a un diagrama para ver el valor puntual.'
          );
        }
        return (
          'Activá la herramienta <strong>Seleccionar</strong> en modo <strong>Tensiones</strong> para ver los esfuerzos completos al clickear en una barra.' +
          '<br/><br/>' +
          'O simplemente acercá el mouse a un diagrama para ver el valor puntual.'
        );
      },
      position: 'auto',
      overlayOpacity: 0.25,
      allowInteraction: true,
      cardPosition: { x: 9999, y: 9999 },  // clamped to bottom-right
      cardWidth: 260,
      mobileCardMaxHeight: '35vh',
      onEnter: () => {
        // Set select tool in stress mode
        uiStore.currentTool = 'select';
        uiStore.selectMode = 'stress';
        if (!uiStore.showFloatingTools) uiStore.showFloatingTools = true;
      },
      onExit: () => {
        // Restore default selection mode
        uiStore.currentTool = 'select';
        uiStore.selectMode = 'elements';
      },
    },

    // ─── 10: Advanced analysis ───
    {
      id: 'advanced',
      target: '[data-tour="advanced-section"]',
      title: 'Análisis Avanzado',
      get description() {
        let text =
          'Herramientas para ir más allá del cálculo de barras.' +
          '<br/><br/>' +
          'Podés clickear en <strong>(?)</strong> a la derecha de cada una para ver qué hace.';
        if (is3D()) {
          text +=
            ' Como dato, Dedaliano 2D cuenta con muchas más funciones avanzadas actualmente.';
        }
        text +=
          '<br/><br/>' +
          'Tené en cuenta que estas funciones siguen en desarrollo. Se agradece reportar bugs/errores.';
        return text;
      },
      position: 'right',
      allowInteraction: true,
      onEnter: () => {
        if (uiStore.isMobile) {
          uiStore.leftDrawerOpen = true;
        } else if (!uiStore.leftSidebarOpen) {
          uiStore.leftSidebarOpen = true;
        }
        // On mobile, Toolbar mounts only when drawer opens — need to wait for mount
        // before dispatching the event that opens the Advanced section
        const delay = uiStore.isMobile ? 350 : 0;
        setTimeout(() => {
          window.dispatchEvent(new Event('dedaliano-open-advanced'));
          setTimeout(() => {
            const el = document.querySelector('[data-tour="advanced-section"]');
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 150);
        }, delay);
      },
      onExit: () => {
        if (uiStore.isMobile) uiStore.leftDrawerOpen = false;
      },
    },

    // ─── 11: Config & Project ───
    {
      id: 'config-project',
      target: '[data-tour="config-project-section"]',
      title: 'Configuración y Proyecto',
      mobileCardMaxHeight: '35vh',
      description:
        '<strong>Configuración</strong> — Opciones de visualización: grilla, etiquetas, unidades y <strong>Cálculo en tiempo real</strong> (recalcula automáticamente al editar la estructura).' +
        '<br/><br/>' +
        '<strong>Proyecto</strong> — Guardá tu trabajo, compartí un link para que cualquiera vea tu estructura, y exportá reportes (Excel, PDF, PNG, CSV).' +
        '<br/><br/>' +
        'Las herramientas de exportar/importar DXF y SVG están en desarrollo.',
      position: 'right',
      allowInteraction: true,
      onEnter: () => {
        // Ensure sections are closed so spotlight covers both collapsed headers
        window.dispatchEvent(new Event('dedaliano-close-config'));
        window.dispatchEvent(new Event('dedaliano-close-project'));
        if (uiStore.isMobile) {
          uiStore.leftDrawerOpen = true;
        } else if (!uiStore.leftSidebarOpen) {
          uiStore.leftSidebarOpen = true;
        }
        setTimeout(() => {
          const el = document.querySelector('[data-tour="config-project-section"]');
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      },
    },

    // ─── 12: Feedback ───
    {
      id: 'feedback',
      target: '[data-tour="feedback-widget"]',
      title: 'Reportá bugs o sugerí mejoras',
      mobileCardMaxHeight: '25vh',
      mobileCardBottom: '64px',
      description:
        '¿Encontraste un error o tenés una idea?' +
        '<br/>' +
        'Presioná este botón para enviarme un reporte.' +
        '<br/><br/>' +
        'Se incluye automáticamente el estado de tu modelo para que pueda reproducir tu problema.',
      position: 'left',
      highlightPadding: 12,
      onEnter: () => {
        if (uiStore.isMobile) {
          uiStore.leftDrawerOpen = false;
          uiStore.rightDrawerOpen = false;
        }
      },
    },

    // ─── 13: Goodbye ───
    {
      id: 'goodbye',
      target: 'none',
      title: 'Gracias por usar Dedaliano :)',
      description:
        'Espero que sea útil para aprender y calcular estructuras.' +
        '<br/><br/>' +
        'Si te gusta, compartí el link con colegas y amigos.' +
        '<br/><br/>' +
        '<em style="color:#4ecdc4; font-style:normal">Bauti</em>',
      position: 'center',
    },
  ];
}
