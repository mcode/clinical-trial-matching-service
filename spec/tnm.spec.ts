import {
  parseTNM,
  convertTNMToCancerStage,
  convertTNMValuesToCancerStage,
  convertCodeableConceptToTNM,
  extractTNM
} from '../src/tnm';

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
    expect(parseTNM('cTis')).toEqual([
      {
        parameter: 'T',
        value: null,
        prefixModifiers: 'c',
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

describe('convertCodeableConcetpToTNM', () => {
  it('handles blank codeable concepts', () => {
    // Everything in a codeable concept is undefined, so nothing is valid
    expect(convertCodeableConceptToTNM({})).toBeUndefined();
  });
  it('handles a codeable concept with a system but no code', () => {
    expect(
      convertCodeableConceptToTNM({
        coding: [
          {
            system: 'http://snomed.info/sct'
          }
        ]
      })
    ).toBeUndefined();
  });
  it('handles a codeable concept with a code but no system', () => {
    expect(
      convertCodeableConceptToTNM({
        coding: [
          {
            code: '1228923003'
          }
        ]
      })
    ).toBeUndefined();
  });
  it('handles a codeable concept with an unknown system/code', () => {
    expect(
      convertCodeableConceptToTNM({
        coding: [
          {
            system: 'http://www.example.com/invalid',
            code: 'also-invalid'
          }
        ]
      })
    ).toBeUndefined();
  });
});

describe('extractTNM()', () => {
  it('does not overwrite with later values', () => {
    // This tests "early quit" sort of
    expect(
      extractTNM([
        {
          resourceType: 'Observation',
          code: {},
          status: 'final',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '1228923003'
              }
            ]
          }
        },
        {
          resourceType: 'Observation',
          code: {},
          status: 'final',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '1229897000'
              }
            ]
          }
        },
        {
          resourceType: 'Observation',
          code: {},
          status: 'final',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '1229913001'
              }
            ]
          }
        },
        {
          resourceType: 'Observation',
          code: {},
          status: 'final',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '1228904005'
              }
            ]
          }
        },
        {
          resourceType: 'Observation',
          code: {},
          status: 'final',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '1229889007'
              }
            ]
          }
        },
        {
          resourceType: 'Observation',
          code: {},
          status: 'final',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '1229901006'
              }
            ]
          }
        }
      ])
    ).toEqual({
      tumor: 4,
      node: 3,
      metastasis: 1
    });
    // So check each field individually as well
    expect(
      extractTNM([
        {
          resourceType: 'Observation',
          code: {},
          status: 'final',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '1228923003'
              }
            ]
          }
        },
        {
          resourceType: 'Observation',
          code: {},
          status: 'final',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '1228904005'
              }
            ]
          }
        }
      ])
    ).toEqual({
      tumor: 4
    });
    expect(
      extractTNM([
        {
          resourceType: 'Observation',
          code: {},
          status: 'final',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '1229897000'
              }
            ]
          }
        },
        {
          resourceType: 'Observation',
          code: {},
          status: 'final',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '1229889007'
              }
            ]
          }
        }
      ])
    ).toEqual({
      node: 3
    });
    expect(
      extractTNM([
        {
          resourceType: 'Observation',
          code: {},
          status: 'final',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '1229913001'
              }
            ]
          }
        },
        {
          resourceType: 'Observation',
          code: {},
          status: 'final',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '1229901006'
              }
            ]
          }
        }
      ])
    ).toEqual({
      metastasis: 1
    });
  });
  it('extracts expected values', () => {
    expect(
      extractTNM([
        // Observation with an unknown system
        {
          resourceType: 'Observation',
          code: {},
          status: 'final',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://example.com/ignore-this',
                code: '1229901006'
              }
            ]
          }
        },
        // Code that's valid FHIR but will never match anything
        {
          resourceType: 'Observation',
          code: {},
          status: 'final',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: 'invalid SNOMED code'
              }
            ]
          }
        },
        // Non-observation resource that should be ignored
        {
          resourceType: 'Patient'
        },
        // Tumor observation
        {
          resourceType: 'Observation',
          code: {},
          status: 'final',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '1228869002'
              }
            ]
          }
        },
        // Node observation
        {
          resourceType: 'Observation',
          code: {},
          status: 'final',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '1229889007'
              }
            ]
          }
        },
        // Metastasis observation
        {
          resourceType: 'Observation',
          code: {},
          status: 'final',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://snomed.info/sct',
                code: '1229901006'
              }
            ]
          }
        }
      ])
    ).toEqual({
      tumor: 1,
      node: 1,
      metastasis: 0
    });
  });
  it('handles Observations without valueCodeableConcepts', () => {
    expect(
      extractTNM([
        {
          resourceType: 'Observation',
          code: {},
          status: 'final',
          valueBoolean: true
        }
      ])
    ).toEqual({});
  });
});
