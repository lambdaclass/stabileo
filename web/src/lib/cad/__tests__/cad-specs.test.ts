import { describe, it, expect } from 'vitest';
import { parseMemberSpecText, parseScheduleRow, parseLevelRow, resolveSection, cleanCadText } from '../specs';
import type { SectionScheduleEntry } from '../types';

describe('parseMemberSpecText', () => {
  it('parses real-world label shapes', () => {
    expect(parseMemberSpecText('C1 (40x20)')).toMatchObject({ mark: 'C1', kind: 'column', b: 0.4, h: 0.2 });
    expect(parseMemberSpecText('V-101: 15x40')).toMatchObject({ mark: 'V-101', kind: 'beam', b: 0.15, h: 0.4 });
    expect(parseMemberSpecText('VIGA 20x50')).toMatchObject({ kind: 'beam', b: 0.2, h: 0.5 });
    expect(parseMemberSpecText('TABIQUE 20')).toMatchObject({ kind: 'wall', t: 0.2 });
    expect(parseMemberSpecText('T2 e=20')).toMatchObject({ mark: 'T2', kind: 'wall', t: 0.2 });
    expect(parseMemberSpecText('LOSA h=15')).toMatchObject({ kind: 'slab', t: 0.15 });
    expect(parseMemberSpecText('L1 15')).toMatchObject({ mark: 'L1', kind: 'slab', t: 0.15 });
  });

  it('parses the template beam/wall label shapes (incl. alpha marks)', () => {
    // Numeric and dash-numeric marks.
    expect(parseMemberSpecText('V1 20x50')).toMatchObject({ mark: 'V1', kind: 'beam', b: 0.2, h: 0.5 });
    expect(parseMemberSpecText('V2 15x40')).toMatchObject({ mark: 'V2', kind: 'beam', b: 0.15, h: 0.4 });
    expect(parseMemberSpecText('V3 25x60')).toMatchObject({ mark: 'V3', kind: 'beam', b: 0.25, h: 0.6 });
    // Dash + WORD role marks — the prefix keeps the kind a beam even when the
    // tag contains a slab keyword ("BALCON").
    expect(parseMemberSpecText('V-INT 18x45')).toMatchObject({ mark: 'V-INT', kind: 'beam', b: 0.18, h: 0.45 });
    expect(parseMemberSpecText('V-PERIM 20x55')).toMatchObject({ mark: 'V-PERIM', kind: 'beam', b: 0.2, h: 0.55 });
    expect(parseMemberSpecText('V-BALCON: 15x35')).toMatchObject({ mark: 'V-BALCON', kind: 'beam', b: 0.15, h: 0.35 });
    // Keyword + mark: "VIGA" is the keyword, "V2" is the mark.
    expect(parseMemberSpecText('VIGA V2 15x40')).toMatchObject({ mark: 'V2', kind: 'beam', b: 0.15, h: 0.4 });
    // Wall thickness from "e=" labels and TABIQUE keyword + mark.
    expect(parseMemberSpecText('T1 e=20')).toMatchObject({ mark: 'T1', kind: 'wall', t: 0.2 });
    expect(parseMemberSpecText('T2 e=15')).toMatchObject({ mark: 'T2', kind: 'wall', t: 0.15 });
    expect(parseMemberSpecText('TABIQUE T3 e=18')).toMatchObject({ mark: 'T3', kind: 'wall', t: 0.18 });
  });

  it('cleans MTEXT formatting before parsing', () => {
    expect(cleanCadText('{\\fCentury Gothic|b0;BAÑO}')).toBe('BAÑO');
    expect(parseMemberSpecText('\\pxqc;{\\Fromans|c129;H = 2.40 m}')).toBeNull(); // ceiling height, not a member (240 cm out of range and no kind/mark… h= matches though)
  });

  it('rejects texts with no structural meaning', () => {
    expect(parseMemberSpecText('PLANTA TIPO')).toBeNull();
    expect(parseMemberSpecText('ESTAR - COMEDOR')).toBeNull();
  });
});

describe('parseScheduleRow / parseLevelRow', () => {
  it('parses column/beam schedule rows with ranges and wildcards', () => {
    expect(parseScheduleRow('C* 1-3 40x60', 'column')).toMatchObject({
      kind: 'column', mark: '*', fromFloor: 1, toFloor: 3, b: 0.4, h: 0.6, source: 'cad',
    });
    expect(parseScheduleRow('C1 4-10 30x50', 'column')).toMatchObject({
      mark: 'C1', fromFloor: 4, toFloor: 10, b: 0.3, h: 0.5,
    });
    expect(parseScheduleRow('L* 10 12', 'slab')).toMatchObject({
      mark: '*', fromFloor: 10, toFloor: 10, t: 0.12,
    });
    expect(parseScheduleRow('T* 1-10 20', 'wall')).toMatchObject({ t: 0.2 });
    expect(parseScheduleRow('garbage row', 'column')).toBeNull();
  });

  it('parses level rows', () => {
    expect(parseLevelRow('LEVELS 1 3.0')).toEqual({ from: 1, to: 1, h: 3 });
    expect(parseLevelRow('LEVELS 2-10 2.8')).toEqual({ from: 2, to: 10, h: 2.8 });
    expect(parseLevelRow('NIVELES 1-3 3.2')).toEqual({ from: 1, to: 3, h: 3.2 });
    expect(parseLevelRow('whatever')).toBeNull();
  });
});

describe('resolveSection precedence', () => {
  const cadRow: SectionScheduleEntry = { kind: 'column', mark: '*', fromFloor: 1, toFloor: 3, b: 0.4, h: 0.6, source: 'cad' };
  const wizardRow: SectionScheduleEntry = { kind: 'column', mark: '*', fromFloor: 1, toFloor: 3, b: 0.45, h: 0.65, source: 'wizard' };

  it('exact schedule > label > wildcard schedule > geometry > default', () => {
    const exactRow: SectionScheduleEntry = { kind: 'column', mark: 'C1', fromFloor: 1, toFloor: 3, b: 0.5, h: 0.5, source: 'cad' };
    // (1) an exact-mark schedule row beats the member's own label.
    expect(resolveSection('column', 'C1', 2, [cadRow, exactRow], { b: 0.2, h: 0.2 }, { b: 0.3, h: 0.3 }, { b: 0.25, h: 0.25 }))
      .toMatchObject({ b: 0.5, h: 0.5, source: 'schedule' });
    // (2) a LABEL beats a WILDCARD schedule (the key fix: V*-style catch-alls
    //     no longer clobber a specifically-labelled member).
    expect(resolveSection('column', 'C1', 2, [cadRow], { b: 0.2, h: 0.2 }, { b: 0.3, h: 0.3 }, { b: 0.25, h: 0.25 }))
      .toMatchObject({ b: 0.2, h: 0.2, source: 'label' });
    // (3) with no label, the wildcard schedule applies (beats geometry).
    expect(resolveSection('column', 'C1', 2, [cadRow], undefined, { b: 0.3, h: 0.3 }, { b: 0.25, h: 0.25 }))
      .toMatchObject({ b: 0.4, h: 0.6, source: 'schedule' });
    // (4) out of every schedule range → label, then geometry, then default.
    expect(resolveSection('column', 'C1', 5, [cadRow], { b: 0.2, h: 0.2 }, { b: 0.3, h: 0.3 }, { b: 0.25, h: 0.25 }))
      .toMatchObject({ b: 0.2, source: 'label' });
    expect(resolveSection('column', 'C1', 5, [cadRow], undefined, { b: 0.3, h: 0.3 }, { b: 0.25, h: 0.25 }))
      .toMatchObject({ b: 0.3, source: 'geometry' });
    expect(resolveSection('column', 'C1', 5, [cadRow], undefined, undefined, { b: 0.25, h: 0.25 }))
      .toMatchObject({ b: 0.25, source: 'default' });
  });

  it('exact beam label/schedule overrides a wildcard beam schedule', () => {
    const vWild: SectionScheduleEntry = { kind: 'beam', mark: '*', fromFloor: 1, toFloor: 10, b: 0.15, h: 0.4, source: 'cad' };
    // labelled "V1 20x50" → keeps 20x50 despite the V* 15x40 wildcard.
    expect(resolveSection('beam', 'V1', 1, [vWild], { b: 0.2, h: 0.5 }, undefined, { b: 0.2, h: 0.5 }))
      .toMatchObject({ b: 0.2, h: 0.5, source: 'label' });
    // an explicit V1 schedule row still wins over the label.
    const v1Exact: SectionScheduleEntry = { kind: 'beam', mark: 'V1', fromFloor: 1, toFloor: 10, b: 0.25, h: 0.6, source: 'cad' };
    expect(resolveSection('beam', 'V1', 1, [vWild, v1Exact], { b: 0.2, h: 0.5 }, undefined, {}))
      .toMatchObject({ b: 0.25, h: 0.6, source: 'schedule' });
    // an unlabelled beam still falls back to the wildcard.
    expect(resolveSection('beam', undefined, 1, [vWild], undefined, undefined, { b: 0.2, h: 0.5 }))
      .toMatchObject({ b: 0.15, h: 0.4, source: 'schedule' });
  });

  it('wizard rows beat CAD rows; exact mark beats wildcard', () => {
    expect(resolveSection('column', 'C1', 2, [cadRow, wizardRow], undefined, undefined, {}))
      .toMatchObject({ b: 0.45, source: 'schedule' });
    const exact: SectionScheduleEntry = { ...cadRow, mark: 'C1', b: 0.5, h: 0.5 };
    expect(resolveSection('column', 'C1', 2, [cadRow, exact], undefined, undefined, {}))
      .toMatchObject({ b: 0.5 });
  });

  it('floor ranges select different sections per story', () => {
    const upper: SectionScheduleEntry = { kind: 'column', mark: '*', fromFloor: 4, toFloor: 10, b: 0.3, h: 0.5, source: 'cad' };
    expect(resolveSection('column', undefined, 3, [cadRow, upper], undefined, undefined, {})).toMatchObject({ b: 0.4 });
    expect(resolveSection('column', undefined, 4, [cadRow, upper], undefined, undefined, {})).toMatchObject({ b: 0.3 });
  });
});
