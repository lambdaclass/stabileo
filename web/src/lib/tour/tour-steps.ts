// Tour step definitions for the /demo guided walkthrough
import type { TourStep, TourActionButton } from '../store/tour.svelte';
import { uiStore, modelStore, resultsStore } from '../store';
import { t } from '../i18n';

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
      title: t('tour.welcomeTitle'),
      description: t('tour.welcomeDesc'),
      position: 'center',
    },

    // ─── 1: Mode toggle ───
    {
      id: 'mode-toggle',
      target: '[data-tour="mode-toggle"]',
      title: t('tour.modeToggleTitle'),
      description: t('tour.modeToggleDesc'),
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
      title: t('tour.buildOptionsTitle'),
      description: t('tour.buildOptionsDesc'),
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
      title: t('tour.examplesTitle'),
      get description() {
        if (is3D()) {
          return t('tour.examplesDesc3D');
        }
        return t('tour.examplesDesc2D');
      },
      position: 'right',
      allowInteraction: true,
      get actionButton(): TourActionButton {
        return {
          label: is3D() ? t('tour.examplesBtn3D') : t('tour.examplesBtn2D'),
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
      title: t('tour.manualToolsTitle'),
      get description() {
        const m = uiStore.isMobile;
        return (
          t('tour.manualToolsIntro') +
          '<br/><br/>' +
          `<strong>1.</strong> ${m ? '● ' : ''}${t('tour.manualToolsNode')}${m ? '' : ' (N)'} — ${t('tour.manualToolsNodeDesc')}` +
          '<br/>' +
          `<strong>2.</strong> ${m ? '— ' : ''}${t('tour.manualToolsElement')}${m ? '' : ' (E)'} — ${t('tour.manualToolsElementDesc')}` +
          '<br/>' +
          `<strong>3.</strong> ${m ? '▽ ' : ''}${t('tour.manualToolsSupport')}${m ? '' : ' (S)'} — ${t('tour.manualToolsSupportDesc')}` +
          '<br/>' +
          `<strong>4.</strong> ${m ? '↓ ' : ''}${t('tour.manualToolsLoad')}${m ? '' : ' (L)'} — ${t('tour.manualToolsLoadDesc')}` +
          '<br/><br/>' +
          t('tour.manualToolsMaterials')
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
      title: t('tour.rightPanelTitle'),
      description: t('tour.rightPanelDesc'),
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
      title: t('tour.solveTitle'),
      description: t('tour.solveDesc'),
      position: 'right',
      allowInteraction: true,
      autoAdvance: true,
      actionButton: {
        label: t('tour.solveBtn'),
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
      title: t('tour.resultsTitle'),
      description: t('tour.resultsDesc'),
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
      title: t('tour.navigateTitle'),
      get description() {
        const m = uiStore.isMobile;
        let text: string;
        if (m) {
          text = t('tour.navigateDescMobile');
        } else {
          text = t('tour.navigateDescDesktop');
        }
        if (is3D()) {
          text +=
            '<br/><br/>' +
            t('tour.navigateDesc3DExtra');
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
          // Show the minimized results button so user sees it
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
      title: t('tour.queryResultsTitle'),
      get description() {
        if (uiStore.isMobile) {
          return t('tour.queryResultsDescMobile');
        }
        return t('tour.queryResultsDescDesktop');
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
      title: t('tour.advancedTitle'),
      get description() {
        let text = t('tour.advancedDesc');
        if (is3D()) {
          text += t('tour.advancedDesc3DExtra');
        }
        text +=
          '<br/><br/>' +
          t('tour.advancedDescBeta');
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
      title: t('tour.configProjectTitle'),
      mobileCardMaxHeight: '35vh',
      description: t('tour.configProjectDesc'),
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
      title: t('tour.feedbackTitle'),
      mobileCardMaxHeight: '25vh',
      mobileCardBottom: '64px',
      description: t('tour.feedbackDesc'),
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
      title: t('tour.goodbyeTitle'),
      description: t('tour.goodbyeDesc'),
      position: 'center',
    },
  ];
}
