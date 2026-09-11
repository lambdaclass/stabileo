import { describe, it, expect } from 'vitest';
import {
  BUILT_UP_ARRANGEMENTS, isBuiltUpArrangement, defaultProfileSpec,
  specToComposition, compositionToSpec, resolveRotationDeg, isCompound, sameProfileSpec,
  type ProfileSpec,
} from '../profile-spec';
import { ARRANGEMENTS } from '../../engine/generators/built-up-section';
import { defaultProfileSpec as emitDefault } from '../../engine/generators/emit';

describe('the vocabulary is one list, not two', () => {
  /*
   * The placement table stayed in the generators and the list moved down. If they ever drift,
   * an arrangement exists that nothing can place — or a placement exists nothing can name.
   */
  it('every arrangement has a placement, and every placement has a name', () => {
    expect([...BUILT_UP_ARRANGEMENTS].sort()).toEqual(Object.keys(ARRANGEMENTS).sort());
  });

  it('emit re-exports the same default, not a copy of it', () => {
    expect(emitDefault).toBe(defaultProfileSpec);
  });

  it('ships seven arrangements', () => {
    expect(BUILT_UP_ARRANGEMENTS).toHaveLength(7);
  });
});

describe('isBuiltUpArrangement', () => {
  it('accepts the seven', () => {
    for (const a of BUILT_UP_ARRANGEMENTS) expect(isBuiltUpArrangement(a)).toBe(true);
  });

  it('rejects anything else, including near misses and non-strings', () => {
    for (const v of ['Single', 'double-back', 'doubleback', '', null, undefined, 3, {}]) {
      expect(isBuiltUpArrangement(v)).toBe(false);
    }
  });
});

describe('specToComposition', () => {
  it('carries the three stored fields', () => {
    const spec: ProfileSpec = { profileName: 'L 75x75x6', arrangement: 'doubleBack', gapMm: 10, rotationDeg: 90 };
    expect(specToComposition(spec)).toEqual({ profileName: 'L 75x75x6', arrangement: 'doubleBack', gapMm: 10 });
  });

  it('does NOT carry rotation — that is a separate field on the section', () => {
    const spec: ProfileSpec = { profileName: 'IPE 200', arrangement: 'single', gapMm: 0, rotationDeg: 45 };
    expect(specToComposition(spec)).not.toHaveProperty('rotationDeg');
    expect(specToComposition(spec)).not.toHaveProperty('rotation');
  });

  it('clamps a negative gap, which would place the parts inside one another', () => {
    const spec: ProfileSpec = { profileName: 'UPN 100', arrangement: 'doubleFacing', gapMm: -5, rotationDeg: 0 };
    expect(specToComposition(spec).gapMm).toBe(0);
  });

  /*
   * The resolved name is an argument, not a guess. `emit.ts` passes `resolved.name` because
   * what the user typed and what the catalogue matched are not always the same string, and a
   * stored section must hold the catalogue's.
   */
  it('prefers the resolved name when one is supplied', () => {
    const spec = defaultProfileSpec('ipe200');
    expect(specToComposition(spec, 'IPE 200').profileName).toBe('IPE 200');
  });

  it('falls back to the spec name when none is', () => {
    expect(specToComposition(defaultProfileSpec('IPE 200')).profileName).toBe('IPE 200');
  });
});

describe('compositionToSpec', () => {
  it('round-trips a compound section', () => {
    const spec: ProfileSpec = { profileName: 'L 75x75x6', arrangement: 'quadBox', gapMm: 12, rotationDeg: 90 };
    const back = compositionToSpec({ composition: specToComposition(spec), rotation: 90 });
    expect(back).toEqual(spec);
  });

  /*
   * The one asymmetry in the round trip, and it is deliberate. `'auto'` means "ask the member",
   * and a stored section has no member to ask — so it comes back as the number that was
   * actually written. A round trip that returned `'auto'` would re-open the question after the
   * model already answered it.
   */
  it('never returns auto: a stored rotation is a number', () => {
    const spec = defaultProfileSpec('IPE 200');
    expect(spec.rotationDeg).toBe('auto');
    const back = compositionToSpec({ composition: specToComposition(spec), rotation: 17 });
    expect(back!.rotationDeg).toBe(17);
  });

  it('reads an absent rotation as zero', () => {
    expect(compositionToSpec({ composition: { profileName: 'IPE 200', arrangement: 'single', gapMm: 0 } })!.rotationDeg).toBe(0);
  });

  /*
   * Null, not a default. A section with no composition was built from a template or typed by
   * hand, and returning `defaultProfileSpec(name)` would assert that its name is a catalogue
   * designation — which for a built section it is not.
   */
  it('returns null for a section that was not composed', () => {
    expect(compositionToSpec({ name: 'Mi seccion' })).toBeNull();
    expect(compositionToSpec(undefined)).toBeNull();
    expect(compositionToSpec(null)).toBeNull();
  });

  /*
   * An arrangement this version does not know — a later file format, a hand-edited `.ded`.
   * Reading it as `single` would draw one profile where the file says four.
   */
  it('returns null for an unknown arrangement rather than falling back to single', () => {
    const back = compositionToSpec({ composition: { profileName: 'L 75x75x6', arrangement: 'sextupleHelix', gapMm: 8 } });
    expect(back).toBeNull();
  });
});

describe('resolveRotationDeg', () => {
  it('takes the member angle when the spec says auto', () => {
    expect(resolveRotationDeg(defaultProfileSpec('IPE 200'), 11.3)).toBe(11.3);
  });

  it('overrides the member angle when the spec names one', () => {
    const spec: ProfileSpec = { profileName: 'IPE 200', arrangement: 'single', gapMm: 0, rotationDeg: 90 };
    expect(resolveRotationDeg(spec, 11.3)).toBe(90);
  });

  it('an explicit zero overrides, it does not read as absent', () => {
    const spec: ProfileSpec = { profileName: 'IPE 200', arrangement: 'single', gapMm: 0, rotationDeg: 0 };
    expect(resolveRotationDeg(spec, 11.3)).toBe(0);
  });
});

describe('isCompound and sameProfileSpec', () => {
  it('single is the only non-compound arrangement', () => {
    for (const a of BUILT_UP_ARRANGEMENTS) {
      expect(isCompound({ ...defaultProfileSpec('IPE 200'), arrangement: a })).toBe(a !== 'single');
    }
  });

  it('tells a real edit from a no-op re-pick', () => {
    const a = defaultProfileSpec('IPE 200');
    expect(sameProfileSpec(a, defaultProfileSpec('IPE 200'))).toBe(true);
    expect(sameProfileSpec(a, { ...a, gapMm: 1 })).toBe(false);
    expect(sameProfileSpec(a, { ...a, rotationDeg: 0 })).toBe(false);
    expect(sameProfileSpec(a, { ...a, arrangement: 'doubleBack' })).toBe(false);
  });
});
