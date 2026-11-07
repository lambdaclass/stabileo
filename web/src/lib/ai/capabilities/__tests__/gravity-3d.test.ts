import { describe, expect, it } from 'vitest';
import { outcomeFromToolCall } from '..';

type Load = { type: string; data: Record<string, unknown> };

describe('a 3D beam load from the AI points down', () => {
  it('is along global Z, not the local y that is horizontal on a horizontal beam', () => {
    const outcome = outcomeFromToolCall('create_portal_frame_3d', { width: 6, depth: 4, height: 3, q_beam: -10 });
    expect(outcome?.kind).toBe('snapshot');
    if (outcome?.kind !== 'snapshot') return;
    const loads = outcome.snapshot.loads as Load[];
    expect(loads.length).toBeGreaterThan(0);
    for (const l of loads) {
      expect(l.type).toBe('distributed3d');
      expect(l.data).toMatchObject({ frame: 'global', qZI: -10, qZJ: -10, qYI: 0, qYJ: 0 });
    }
  });

  it('holds for loads an edit adds to a 3D model', () => {
    const base = outcomeFromToolCall('create_portal_frame_3d', { width: 6, depth: 4, height: 3 });
    if (base?.kind !== 'snapshot') throw new Error('no base model');
    const edited = outcomeFromToolCall('set_all_beam_loads', { q: -7 }, base.snapshot);
    if (edited?.kind !== 'snapshot') throw new Error('edit did not apply');
    const loads = edited.snapshot.loads as Load[];
    expect(loads.length).toBeGreaterThan(0);
    for (const l of loads) expect(l.data).toMatchObject({ frame: 'global', qZI: -7, qZJ: -7, qYI: 0, qYJ: 0 });
  });
});
