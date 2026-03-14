// Tour state store — manages guided demo walkthrough
// Pattern follows ui.svelte.ts (Svelte 5 runes)

export interface TourActionButton {
  label: string;                       // Button text, e.g. "Ejemplo Pórtico"
  action: () => void;                  // Callback when clicked
  advanceAfter?: boolean;              // Auto-advance to next step after action (default true)
}

export interface TourStep {
  id: string;
  target: string;              // CSS selector or 'none' for center-screen
  title: string;
  description: string;         // HTML allowed
  position: 'top' | 'bottom' | 'left' | 'right' | 'center' | 'auto';
  waitFor?: () => boolean;     // Reactive condition — "Next" disabled until true
  onEnter?: () => void;        // Side-effect when step activates
  onExit?: () => void;         // Cleanup when leaving step
  highlightPadding?: number;   // Extra px around target (default 8)
  allowInteraction?: boolean;  // Let user click through spotlight hole (default false)
  overlayOpacity?: number;     // SVG backdrop darkness 0-1 (default 0.6)
  autoAdvance?: boolean;       // Auto-advance when waitFor becomes true
  cardPosition?: { x: number; y: number }; // Override card position explicitly
  cardWidth?: number;            // Override card width (px), default CARD_W=380
  mobileCardMaxHeight?: string;  // CSS max-height override for mobile (e.g. '35vh')
  mobileCardBottom?: string;     // CSS bottom override for mobile (e.g. '64px')
  actionButton?: TourActionButton;     // In-card action button (replaces "Esperando..." when waitFor not met)
  multiAction?: TourActionButton[];    // Multiple action buttons shown alongside "Siguiente →"
  skip?: () => boolean;                // If returns true, step is skipped (next/prev jump over it)
}

// Migrate old storage keys
if (typeof localStorage !== 'undefined') {
  for (const key of ['tour-started', 'tour-completed']) {
    const old = localStorage.getItem(`dedaliano-${key}`);
    if (old !== null && localStorage.getItem(`stabileo-${key}`) === null) {
      localStorage.setItem(`stabileo-${key}`, old);
      localStorage.removeItem(`dedaliano-${key}`);
    }
  }
}

function createTourStore() {
  let _isActive = $state(false);
  let _currentStepIndex = $state(0);
  let _steps = $state<TourStep[]>([]);
  let _targetRect = $state<DOMRect | null>(null);
  let _isTransitioning = $state(false);

  return {
    // --- Getters ---
    get isActive() { return _isActive; },
    get currentStepIndex() { return _currentStepIndex; },
    get currentStep(): TourStep | null { return _steps[_currentStepIndex] ?? null; },
    get totalSteps() { return _steps.length; },
    get isFirstStep() { return _currentStepIndex === 0; },
    get isLastStep() { return _currentStepIndex === _steps.length - 1; },
    get progress() { return _steps.length > 0 ? (_currentStepIndex + 1) / _steps.length : 0; },
    get targetRect() { return _targetRect; },
    get isTransitioning() { return _isTransitioning; },

    get canAdvance(): boolean {
      const step = _steps[_currentStepIndex];
      if (!step) return false;
      if (step.waitFor) return step.waitFor();
      return true;
    },

    // --- Actions ---
    start(tourSteps: TourStep[]) {
      _steps = tourSteps;
      _currentStepIndex = 0;
      _isActive = true;
      localStorage.setItem('stabileo-tour-started', 'true');
      _steps[0]?.onEnter?.();
      requestAnimationFrame(() => this.updateTargetRect());
    },

    next() {
      if (_isTransitioning || _currentStepIndex >= _steps.length - 1) return;
      _isTransitioning = true;
      _steps[_currentStepIndex]?.onExit?.();
      // Skip steps whose skip() returns true
      let next = _currentStepIndex + 1;
      while (next < _steps.length - 1 && _steps[next]?.skip?.()) next++;
      _currentStepIndex = next;
      _steps[_currentStepIndex]?.onEnter?.();
      requestAnimationFrame(() => {
        this.updateTargetRect();
        setTimeout(() => { _isTransitioning = false; }, 350);
      });
    },

    prev() {
      if (_isTransitioning || _currentStepIndex <= 0) return;
      _isTransitioning = true;
      _steps[_currentStepIndex]?.onExit?.();
      // Skip steps whose skip() returns true
      let prev = _currentStepIndex - 1;
      while (prev > 0 && _steps[prev]?.skip?.()) prev--;
      _currentStepIndex = prev;
      _steps[_currentStepIndex]?.onEnter?.();
      requestAnimationFrame(() => {
        this.updateTargetRect();
        setTimeout(() => { _isTransitioning = false; }, 350);
      });
    },

    end() {
      _steps[_currentStepIndex]?.onExit?.();
      _isActive = false;
      _currentStepIndex = 0;
      _steps = [];
      _targetRect = null;
      // Clean URL if navigated via /demo
      if (location.pathname === '/demo') {
        history.replaceState(null, '', '/');
      }
      localStorage.setItem('stabileo-tour-completed', 'true');
    },

    updateTargetRect() {
      const step = _steps[_currentStepIndex];
      if (!step || step.target === 'none') {
        _targetRect = null;
        return;
      }
      const el = document.querySelector(step.target);
      _targetRect = el ? el.getBoundingClientRect() : null;
    },
  };
}

export const tourStore = createTourStore();
