import { parseTNM, convertTNMToCancerStage, convertTNMValuesToCancerStage } from '../src/tnm';

describe('parseTNM()', () => {
  it('parses a simple set of fields', () => {
    expect(parseTNM('T1 N0 M0')).toEqual([
      {
        parameter: 'T',
        value: 1,
        prefixModifiers: '',
        suffixModifiers: ''
      },
      {
        parameter: 'N',
        value: 0,
        prefixModifiers: '',
        suffixModifiers: ''
      },
      {
        parameter: 'M',
        value: 0,
        prefixModifiers: '',
        suffixModifiers: ''
      }
    ]);
  });
  it('parses "Tis"', () => {
    expect(parseTNM('Tis')).toEqual([
      {
        parameter: 'T',
        value: null,
        prefixModifiers: '',
        suffixModifiers: 'is'
      }
    ]);
  });
  it('handles junk', () => {
    expect(parseTNM('this is invalid')).toEqual([]);
  });
});

describe('convertTNMToCancerStage()', () => {
  it('returns undefined for invalid values', () => {
    expect(convertTNMToCancerStage('completely invalid')).toBe(undefined);
  });
  it('returns undefined when fields are missing', () => {
    expect(convertTNMToCancerStage('missing data T1')).toBe(undefined);
    expect(convertTNMToCancerStage('missing data T1 N0')).toBe(undefined);
    expect(convertTNMToCancerStage('missing data T1 M0')).toBe(undefined);
    expect(convertTNMToCancerStage('missing data N0')).toBe(undefined);
    expect(convertTNMToCancerStage('missing data N0 M0')).toBe(undefined);
    expect(convertTNMToCancerStage('missing data M0')).toBe(undefined);
    expect(convertTNMToCancerStage('This alMost looks valid but is Not')).toBe(undefined);
  });
  it('returns null for T0 N0 M0', () => {
    expect(convertTNMToCancerStage('T0 N0 M0')).toBe(null);
  });
  it('returns 0 for Tis N0 M0', () => {
    expect(convertTNMToCancerStage('Tis N0 M0')).toEqual(0);
    expect(convertTNMToCancerStage('Tis N0 M0 with added junk')).toEqual(0);
  });
  it('returns as expected even with extra field', () => {
    expect(convertTNMToCancerStage('pT1 pN0 M0 R0 G1')).toEqual(1);
  });
});

describe('convertTNMValuesToCancerStage()', () => {
  it('handles T0 N0 M0', () => {
    expect(convertTNMValuesToCancerStage(0, 0, 0)).toBeNull();
  });
  it('converts Tis N0 M0 to 0', () => {
    expect(convertTNMValuesToCancerStage(0.5, 0, 0)).toEqual(0);
  });
  it('converts T1/T2 N0 M0 to 1', () => {
    expect(convertTNMValuesToCancerStage(1, 0, 0)).toEqual(1);
    expect(convertTNMValuesToCancerStage(2, 0, 0)).toEqual(1);
  });
  it('converts T3/T4 N0 M0 to 2', () => {
    expect(convertTNMValuesToCancerStage(3, 0, 0)).toEqual(2);
    expect(convertTNMValuesToCancerStage(4, 0, 0)).toEqual(2);
  });
  it('converts T? N1/N2/N3 M0 to 3', () => {
    for (let t = 0; t <= 4; t++) {
      expect(convertTNMValuesToCancerStage(t, 1, 0)).toEqual(3);
      expect(convertTNMValuesToCancerStage(t, 2, 0)).toEqual(3);
      expect(convertTNMValuesToCancerStage(t, 3, 0)).toEqual(3);
    }
  });
  it('converts T? N? M1 to 4', () => {
    for (let t = 1; t <= 4; t++) {
      for (let n = 0; n <= 4; n++) {
        expect(convertTNMValuesToCancerStage(t, n, 1)).toEqual(4);
      }
    }
  });
});
