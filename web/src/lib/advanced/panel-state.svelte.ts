import type { AdvGroupId } from './catalog';

/** What the Advanced list keeps while the session lasts: the groups the reader opened and the search typed. */
class AdvancedListState {
  open = $state<AdvGroupId[]>([]);
  query = $state('');
  /** A function asked for from outside the list (the step-by-step catalog), started once the list is back. */
  pending = $state<string | null>(null);

  isOpen(g: AdvGroupId): boolean { return this.open.includes(g); }
  toggle(g: AdvGroupId): void { this.open = this.isOpen(g) ? this.open.filter((x) => x !== g) : [...this.open, g]; }
  reveal(g: AdvGroupId): void { if (!this.isOpen(g)) this.open = [...this.open, g]; }

  /** The step-by-step catalog's groups the reader opened. */
  stepsOpen = $state<string[]>([]);
  toggleSteps(g: string): void { this.stepsOpen = this.stepsOpen.includes(g) ? this.stepsOpen.filter((x) => x !== g) : [...this.stepsOpen, g]; }
  revealSteps(g: string): void { if (!this.stepsOpen.includes(g)) this.stepsOpen = [...this.stepsOpen, g]; }
}

export const advancedList = new AdvancedListState();
