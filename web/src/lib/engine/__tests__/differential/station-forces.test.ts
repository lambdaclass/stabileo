/**
 * Differential test: station design forces, the TypeScript extraction (`station-oracle.ts`, the
 * fallback `computeStationDemands` used to take without WASM, now a test oracle) against the engine's
 * (`extract_beam_station_buffer_3d` / `beam_stations.rs`, the production path).
 *
 * On solved models with distributed and point loads, at every station the two both evaluate,
 * the force tuples must agree; and no governing demand the TypeScript finds may be missed by
 * the engine path the app actually uses.
 */
import { describe, it, expect } from 'vitest';
import qa8 from '../../../templates/fixtures/rc-design-qa-8.json';
import { solveFixture } from '../../design/__tests__/helpers';
import { computeStationDemands } from '../../verification-service';
import { computeStationDemandsOracle } from './station-oracle';
import { EngineUnavailableError } from '../../engine-unavailable';

describe('station design forces: TypeScript oracle against the engine', () => {
  const solved = solveFixture(qa8);
  const combos = solved.model.combinations;
  const engine = computeStationDemands(solved.perCombo, combos, solved.data as never);
  const ts = computeStationDemandsOracle(solved.perCombo, combos);

  it('without the model the engine needs, the app refuses instead of computing in TypeScript', () => {
    expect(() => computeStationDemands(solved.perCombo, combos)).toThrow(EngineUnavailableError);
  });

  it('both paths cover the same members', () => {
    expect([...engine.stations.keys()].sort()).toEqual([...ts.stations.keys()].sort());
    expect(engine.stations.size).toBeGreaterThan(5);
  });

  it('force tuples agree wherever both evaluate a station', () => {
    let compared = 0;
    for (const [id, t] of ts.stations) {
      const e = engine.stations.get(id)!;
      for (const tc of t.comboResults) {
        const ec = e.comboResults.find((c) => c.comboId === tc.comboId)!;
        expect(ec, `combo ${tc.comboId} of member ${id}`).toBeTruthy();
        for (const s of tc.stations) {
          const m = ec.stations.find((x) => Math.abs(x.t - s.t) < 1e-9);
          if (!m) continue;
          compared++;
          for (const k of ['n', 'vy', 'vz', 'my', 'mz'] as const) {
            const scale = Math.max(1, Math.abs(s[k]));
            expect(Math.abs(m[k] - s[k]), `${k} of member ${id} at t=${s.t}`).toBeLessThan(1e-6 * scale);
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(50);
  });

  it('the engine path misses no governing demand the TypeScript finds', () => {
    for (const [id, t] of ts.demands) {
      const e = engine.demands.get(id)!;
      for (const d of t.demands) {
        const m = e.demands.find((x) => x.category === d.category);
        expect(m, `${d.category} of member ${id}`).toBeTruthy();
        expect(m!.absValue, `${d.category} of member ${id}`).toBeGreaterThanOrEqual(d.absValue * (1 - 1e-6) - 1e-9);
      }
    }
  });
});
