import { untrack } from 'svelte';
import { DEFAULT_PLATE_MESH, type PlateMeshSpec } from '../../../lib/model/physical/plate';
import { planPlateMeshes, plateEntry, type PlateMeshPlan } from '../../../lib/store/physical-plates';

type Request = { ids: number[]; spec: PlateMeshSpec };
type Preview =
  | { phase: 'planning'; request: Request; done: number; total: number }
  | { phase: 'ready'; request: Request; plans: PlateMeshPlan[] };

export function createPlateMeshPreview(ids: () => number[]) {
  const stored = untrack(() => plateEntry(ids()[0]!)?.surface.mesh ?? DEFAULT_PLATE_MESH);
  const settings = $state({
    size: stored.size,
    sizeV: stored.sizeV ?? stored.size,
    pattern: stored.pattern ?? 'free',
    orient: stored.orient ?? 'plate',
    element: stored.element,
    followMembers: stored.followMembers,
  });
  const request = $derived({ ids: [...ids()], spec: { ...settings } });
  let state = $state.raw<Preview | null>(null);
  let active: AbortController | null = null;
  const plans = $derived(state?.phase === 'ready' && state.request === request ? state.plans : null);

  const accepted = $derived((plans ?? []).filter(plan => plan.mesh));
  const cells = $derived(accepted.reduce((sum, plan) => sum + plan.cells, 0));
  const localLoads = $derived((plans ?? []).reduce((sum, plan) => sum + plan.localLoads, 0));

  function cancel() {
    active?.abort();
    active = null;
    state = null;
  }

  async function start(current: Request) {
    cancel();
    const owner = new AbortController();
    active = owner;
    const onProgress = (done: number, total: number) => {
      if (active === owner) state = { phase: 'planning', request: current, done, total };
    };
    onProgress(0, current.ids.length);
    try {
      const completed = await planPlateMeshes(current.ids, current.spec, { signal: owner.signal, onProgress });
      if (active === owner && completed) state = { phase: 'ready', request: current, plans: completed };
    } finally {
      if (active === owner) {
        active = null;
        if (state?.phase === 'planning') state = null;
      }
    }
  }

  $effect(() => {
    const current = request;
    untrack(() => { void start(current); });
    return cancel;
  });

  return {
    settings,
    get cells() { return cells; },
    get localLoads() { return localLoads; },
    get accepted() { return accepted; },
    cancel,
    get request() { return request; },
    get plans() { return plans; },
    get progress() { return state?.phase === 'planning' && state.request === request ? state : null; },
    take() {
      const current = plans;
      cancel();
      return current;
    },
  };
}

export type PlateMeshPreview = ReturnType<typeof createPlateMeshPreview>;
