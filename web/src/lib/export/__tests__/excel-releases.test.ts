import { describe, it, expect } from 'vitest';
import { releaseLabel, sectionPropertyHeaders } from '../excel';

describe('Excel export - release labeling', () => {
  it('should return empty string for undefined release', () => {
    expect(releaseLabel(undefined)).toBe('');
  });

  it('should return empty string for all-false release', () => {
    expect(releaseLabel({ my: false, mz: false, t: false })).toBe('');
  });

  it('should show My+T for mixed release', () => {
    expect(releaseLabel({ my: true, mz: false, t: true })).toBe('My+T');
  });

  it('should show Mz for mz-only release', () => {
    expect(releaseLabel({ my: false, mz: true, t: false })).toBe('Mz');
  });

  it('should show My for my-only release', () => {
    expect(releaseLabel({ my: true, mz: false, t: false })).toBe('My');
  });

  it('should show T for t-only release', () => {
    expect(releaseLabel({ my: false, mz: false, t: true })).toBe('T');
  });

  it('should show My+Mz for biaxial bending release', () => {
    expect(releaseLabel({ my: true, mz: true, t: false })).toBe('My+Mz');
  });

  it('should show My+Mz+T for all-released release', () => {
    expect(releaseLabel({ my: true, mz: true, t: true })).toBe('My+Mz+T');
  });

  it('should show Mz+T for mz+t release', () => {
    expect(releaseLabel({ my: false, mz: true, t: true })).toBe('Mz+T');
  });
});

describe('Excel export - section properties of a variable member', () => {
  /*
   * A member of variable section names its section «IPE 300 → IPE 500», but A and I are the
   * end-I section's: under a plain «A (m²)» they read as the member's.
   */
  it('plain headers when every member is prismatic', () => {
    expect(sectionPropertyHeaders(false, false)).toEqual(['A (m²)', 'Iy (m⁴)']);
    expect(sectionPropertyHeaders(true, false)).toEqual(['A (m²)', 'Iy (m⁴)', 'Iz (m⁴)', 'J (m⁴)']);
  });

  it('end-I headers, as Ni and Mi are, when a member is of variable section', () => {
    expect(sectionPropertyHeaders(false, true)).toEqual(['Ai (m²)', 'Iyi (m⁴)']);
    expect(sectionPropertyHeaders(true, true)).toEqual(['Ai (m²)', 'Iyi (m⁴)', 'Izi (m⁴)', 'Ji (m⁴)']);
  });
});
