/**
 * A flight from a file: 1,10 m wide, from the ground at −2,50 to under the floor at 0,00 (its top
 * edge drawn at −0,12, under the slab), 2,60 m of run, riser 0,1786 as the file states. Taken to
 * the levels it rises 2,50 m in 14 risers; its top edge ties to the floor's nodes beside it, its
 * foot stands on the ground.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore, historyStore } from '../../store';
import { placeStairs } from '../ifc-stairs';
import { stairEntries } from '../../store/stairs-pt';

const levels = [{ id: 'S', name: 'Sótano', z: -2.5 }, { id: 'PB', name: 'Planta baja', z: 0 }];

describe('stairs from a file', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('are built as flights, tied to the floor they reach, standing on the ground, and declared for design', () => {
    modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25 } as never);
    const f1 = modelStore.addNode(2.75, -0.55, 0), f2 = modelStore.addNode(2.75, 0.55, 0);
    const r = placeStairs([{
      id: 1, name: 'E1', riserHeight: 0.1786,
      flights: [{ low: [{ x: 0, y: 0.55, z: -2.45 }, { x: 0, y: -0.55, z: -2.45 }], high: [{ x: 2.6, y: 0.55, z: -0.12 }, { x: 2.6, y: -0.55, z: -0.12 }], waist: 0.15 }],
    }], levels);
    expect(r).toMatchObject({ flights: 1, landings: 0, tied: 1, grounded: 1, skipped: [] });
    // Joined by stiff connectors, not constraints: a solve with constraints is slow on a building and
    // gives a response spectrum no participation factors.
    expect(modelStore.model.constraints).toHaveLength(0);
    const links = [...(modelStore.model.connectors?.values() ?? [])];
    expect(links.map((c) => c.nodeI).sort()).toEqual([f1, f2].sort());
    expect([...modelStore.supports.values()].filter((s) => s.type === 'fixed3d')).toHaveLength(2);
    const e = stairEntries().at(-1)!;
    expect(e).toMatchObject({ steps: 14, waist: 0.15 });
    expect(e.riser).toBeCloseTo(2.5 / 14, 9);
    expect(e.width).toBeCloseTo(1.1, 9);
    expect(modelStore.quads.size).toBe(14);
  });

  it('joins two flights by their landing, its shells cut where they arrive, the landing resting on the wall beside it', () => {
    // A stair turning back: up +x from the ground to a landing at +1,25 (its edges drawn 3 cm off
    // and 1 cm under the landing's mid-depth), then up −x beside it to the floor at +2,50.
    modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25 } as never);
    const lvl = [{ id: 'PB', name: 'PB', z: 0 }, { id: 'P1', name: 'P1', z: 2.5 }];
    const w1 = modelStore.addNode(3.9, 0, 1.25), w2 = modelStore.addNode(3.9, 2.1, 1.25);
    const t1 = modelStore.addNode(0, 1.08, 2.5), t2 = modelStore.addNode(0, 2.1, 2.5);
    const r = placeStairs([{
      id: 1, name: 'E', riserHeight: 0.125,
      flights: [
        { low: [{ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }], high: [{ x: 2.47, y: 1, z: 1.24 }, { x: 2.47, y: 0, z: 1.24 }], waist: 0.15 },
        { low: [{ x: 2.5, y: 1.08, z: 1.24 }, { x: 2.5, y: 2.1, z: 1.24 }], high: [{ x: 0, y: 1.08, z: 2.5 }, { x: 0, y: 2.1, z: 2.5 }], waist: 0.15 },
      ],
      landings: [{ corners: [{ x: 2.5, y: 0, z: 1.25 }, { x: 3.7, y: 0, z: 1.25 }, { x: 3.7, y: 2.1, z: 1.25 }, { x: 2.5, y: 2.1, z: 1.25 }], thickness: 0.15 }],
    }], lvl);
    expect(r).toMatchObject({ flights: 2, landings: 1, grounded: 1, skipped: [] });
    // The landing cut at the flights' sides, y = 0, 1, 1,08 (merged with 1) and 2,1: two strips.
    const flat = [...modelStore.quads.values()].filter((q) => q.nodes.every((n) => Math.abs((modelStore.nodes.get(n)!.z ?? 0) - 1.25) < 1e-9));
    expect(flat).toHaveLength(2);
    // Each flight shares its landing edge's nodes with the landing.
    const landingNodes = new Set(flat.flatMap((q) => q.nodes));
    const at = (x: number, y: number) => [...modelStore.nodes.values()].find((n) => Math.hypot(n.x - x, n.y - y, (n.z ?? 0) - 1.25) < 1e-6)?.id;
    for (const [x, y] of [[2.5, 0], [2.5, 1]]) expect(landingNodes.has(at(x, y)!)).toBe(true);
    // The top ties to the floor, the landing's far side to the wall.
    const masters = new Set([...(modelStore.model.connectors?.values() ?? [])].map((c) => c.nodeI));
    for (const n of [t1, t2, w1, w2]) expect(masters.has(n)).toBe(true);
  });

  it('leaves out a flight that touches nothing above its foot, nodes and all', () => {
    modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25 } as never);
    const r = placeStairs([{ id: 1, name: 'Suelta', flights: [{ low: [{ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }], high: [{ x: 2.5, y: 1, z: 1.5 }, { x: 2.5, y: 0, z: 1.5 }], waist: 0.15 }] }], [{ id: 'PB', name: 'PB', z: 0 }]);
    expect(r).toMatchObject({ flights: 0, skipped: ['Suelta'] });
    expect(modelStore.quads.size).toBe(0);
    expect(modelStore.nodes.size).toBe(0);
    expect(modelStore.supports.size).toBe(0);
  });
});
