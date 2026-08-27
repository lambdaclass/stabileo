/**
 * The raw forces report contract, and the two things it must never do:
 * mix itself with reinforcement design, and let a reporting convention hide the solver's own
 * stations.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RC_FORCES_DEFAULT, RC_FORCES_MAGNITUDES, RC_FORCES_SECTIONS, RC_QUARTER_STATIONS,
  rcForcesBlockers, rcForcesSheets, rcResolveStations,
  type RcForcesReportConfig,
} from '../rc-forces-report';
import { buildCriticalStations } from '../../engine/station-design-forces';
import type { ElementForces3D } from '../../engine/types-3d';
import es from '../../i18n/locales/es';
import en from '../../i18n/locales/en';

const cfg = (over: Partial<RcForcesReportConfig> = {}): RcForcesReportConfig =>
  ({ ...RC_FORCES_DEFAULT, ...over });

/** A member long enough for the engine not to take its degenerate branch. */
const member = (length: number) => ({ length } as unknown as ElementForces3D);

describe('this report is not the design report', () => {
  /*
   * §5 is explicit that raw solver results must not be mixed with reinforcement design. A
   * reader who cannot tell which document is in front of them cannot tell a demand from a
   * capacity, so the separation is enforced at the import level rather than by convention.
   */
  it('imports nothing from design or detailing', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, '../rc-forces-report.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/from\s+'[^']*engine\/design/);
    expect(code).not.toMatch(/from\s+'[^']*engine\/detailing/);
  });

  it('offers no reinforcement magnitude', () => {
    // Every magnitude is a field of StationForces. None describes steel.
    expect([...RC_FORCES_MAGNITUDES].sort())
      .toEqual(['my', 'mz', 'n', 'torsion', 'vy', 'vz']);
  });
});

describe('the quarter grid is a convention, and the engine already computes it', () => {
  it('is the five positions', () => {
    expect(RC_QUARTER_STATIONS).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  /*
   * The measured fact behind the default: buildCriticalStations seeds the quarters
   * unconditionally before adding load positions and extrema. So on a normal member the
   * default asks for nothing the engine did not already produce.
   */
  it('every quarter is among the stations the engine computes for a normal member', () => {
    const critical = buildCriticalStations(member(6));
    for (const t of RC_QUARTER_STATIONS) {
      expect(critical, `t=${t}`).toContain(t);
    }
  });

  /*
   * And the case that makes the default an EVALUATION rather than a filter. A member of
   * effectively zero length short-circuits to [0, 1]; filtering the critical set would return
   * two rows where the user asked for five, silently.
   */
  it('but not for a degenerate member, which is why quarters are evaluated not filtered', () => {
    const degenerate = buildCriticalStations(member(0));
    expect(degenerate).toEqual([0, 1]);
    expect(degenerate).not.toContain(0.5);
    // The resolver still yields five, because it does not consult the critical set.
    expect(rcResolveStations('quarters', degenerate)).toHaveLength(5);
  });

  it('critical mode returns what the engine produced, sorted and deduplicated', () => {
    expect(rcResolveStations('critical', [0.5, 0, 1, 0.5])).toEqual([0, 0.5, 1]);
  });

  it('critical mode on a real member includes more than the quarters', () => {
    const critical = buildCriticalStations(member(6));
    const resolved = rcResolveStations('critical', critical);
    expect(resolved.length).toBeGreaterThanOrEqual(RC_QUARTER_STATIONS.length);
  });
});

describe('a convention never hides the solver', () => {
  /*
   * The rule that outranks both modes. `rawStations` is its own section, not an alternative to
   * `stations`, so asking for the quarter convention can never be what makes the engine's own
   * stations unavailable — a reader can always have both in one document.
   */
  it('rawStations survives the quarter mode', () => {
    const sheets = rcForcesSheets(cfg({ stationMode: 'quarters' }));
    expect(sheets).toContain('rawStations');
    expect(sheets).toContain('stations');
  });

  it('rawStations survives a narrowed scope', () => {
    const sheets = rcForcesSheets(cfg({ scope: { kind: 'elements', elementIds: [3] } }));
    expect(sheets).toContain('rawStations');
  });

  it('the default reports every section and every magnitude', () => {
    expect(RC_FORCES_DEFAULT.sections).toEqual(RC_FORCES_SECTIONS);
    expect(RC_FORCES_DEFAULT.magnitudes).toEqual(RC_FORCES_MAGNITUDES);
    expect(RC_FORCES_DEFAULT.stationMode).toBe('quarters');
  });

  /*
   * Sheet order comes from the contract, not from the order the caller listed them, so two
   * configurations asking for the same sheets produce the same workbook.
   */
  it('emits sheets in contract order regardless of request order', () => {
    const a = rcForcesSheets(cfg({ sections: ['stations', 'reactions'] }));
    const b = rcForcesSheets(cfg({ sections: ['reactions', 'stations'] }));
    expect(a).toEqual(b);
    expect(a).toEqual(['reactions', 'stations']);
  });
});

describe('a blocked report says why', () => {
  const solvedWithStations = { solved: true, hasStations: true };

  it('is clear when everything is available', () => {
    expect(rcForcesBlockers(cfg(), solvedWithStations)).toEqual([]);
  });

  it('names the solve when there are no results', () => {
    expect(rcForcesBlockers(cfg(), { solved: false, hasStations: false }))
      .toContain('design.forcesReport.needSolve');
  });

  /*
   * Missing station data only blocks the report when a station sheet was actually asked for.
   * Blocking a reactions-only report on it would be a riddle of the kind this branch has
   * already fixed once on review-submit.
   */
  it('does not name stations for a report that asked for none', () => {
    const reactionsOnly = cfg({ sections: ['reactions'] });
    expect(rcForcesBlockers(reactionsOnly, { solved: true, hasStations: false })).toEqual([]);
  });

  it('names them when a station sheet was asked for', () => {
    expect(rcForcesBlockers(cfg({ sections: ['stations'] }), { solved: true, hasStations: false }))
      .toContain('design.forcesReport.needStations');
  });

  /*
   * null and [] are different, and the difference is the whole reason comboIds is nullable:
   * null is "every combination", [] is "none chosen" and must block rather than silently
   * report everything. The same distinction workspaceFilter already draws.
   */
  it('an empty combination list blocks; null does not', () => {
    expect(rcForcesBlockers(cfg({ comboIds: [] }), solvedWithStations))
      .toContain('design.forcesReport.needCombo');
    expect(rcForcesBlockers(cfg({ comboIds: null }), solvedWithStations)).toEqual([]);
  });

  it('an element scope with no elements blocks', () => {
    expect(rcForcesBlockers(cfg({ scope: { kind: 'elements', elementIds: [] } }),
      solvedWithStations)).toContain('design.forcesReport.needElements');
  });

  it('every blocker it can emit has a sentence in es and en', () => {
    const all = new Set<string>();
    const probes: Array<[Partial<RcForcesReportConfig>, { solved: boolean; hasStations: boolean }]> = [
      [{}, { solved: false, hasStations: false }],
      [{ sections: [] }, solvedWithStations],
      [{ magnitudes: [] }, solvedWithStations],
      [{ scope: { kind: 'elements', elementIds: [] } }, solvedWithStations],
      [{ comboIds: [] }, solvedWithStations],
      [{ sections: ['stations'] }, { solved: true, hasStations: false }],
    ];
    for (const [over, avail] of probes) for (const k of rcForcesBlockers(cfg(over), avail)) all.add(k);
    expect(all.size, 'the probes reach every blocker').toBe(6);
    for (const k of all) {
      expect(es[k as keyof typeof es], k).toBeTruthy();
      expect(en[k as keyof typeof en], k).toBeTruthy();
    }
  });
});
