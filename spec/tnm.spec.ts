import { Observation } from 'fhir/r4';
import {
  parseTNM,
  convertTNMToCancerStage,
  convertTNMValuesToCancerStage,
  convertCodeableConceptToTNM,
  extractTNM
} from '../src/tnm';
import { SNOMED_SYSTEM_URI } from '../src/fhir-constants';
import TNM_CODES, {
  TNM_SNOMED_TUMOR_CODES,
  TNM_SNOMED_NODE_CODES,
  TNM_SNOMED_METASTASIS_CODES
} from '../src/tnm-codes';

// To make the tests more readable, grab out a code to use for each TNM type
const SNOMED_TUMOR_CODE = TNM_SNOMED_TUMOR_CODES[0];
const SNOMED_NODE_CODE = TNM_SNOMED_NODE_CODES[0];
const SNOMED_METASTASIS_CODE = TNM_SNOMED_METASTASIS_CODES[0];

// Function to find a matching code
function find<T extends string, C>(o: Record<T, C>, value: C): T {
  const r = Object.entries(o).find(([, v]) => v === value);
  if (r) {
    return r[0] as T;
  } else {
    throw new Error(`No value ${value} found`);
  }
}

// Various codes that map to various values - again, to make the tests readable
// (as well as ensure mapping changes can't break things)
const SNOMED_T1_CODE = find(TNM_CODES['T'][SNOMED_SYSTEM_URI], 1);
const SNOMED_T4_CODE = find(TNM_CODES['T'][SNOMED_SYSTEM_URI], 4);
const SNOMED_N1_CODE = find(TNM_CODES['N'][SNOMED_SYSTEM_URI], 1);
const SNOMED_N2_CODE = find(TNM_CODES['N'][SNOMED_SYSTEM_URI], 2);
const SNOMED_N3_CODE = find(TNM_CODES['N'][SNOMED_SYSTEM_URI], 3);
const SNOMED_M0_CODE = find(TNM_CODES['M'][SNOMED_SYSTEM_URI], 0);
const SNOMED_M1_CODE = find(TNM_CODES['M'][SNOMED_SYSTEM_URI], 1);

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
            system: SNOMED_SYSTEM_URI
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

/**
 *
 * @param code the code of the thing being observed
 * @param value the value
 * @returns an Observation
 */
function createObservation(code: string, value: string): Observation {
  return {
    resourceType: 'Observation',
    code: {
      coding: [
        {
          system: SNOMED_SYSTEM_URI,
          code: code
        }
      ]
    },
    status: 'final',
    valueCodeableConcept: {
      coding: [
        {
          system: SNOMED_SYSTEM_URI,
          code: value
        }
      ]
    }
  };
}

describe('extractTNM()', () => {
  it('does not overwrite with later values', () => {
    // This tests "early quit" sort of...
    expect(
      extractTNM([
        // T observation
        createObservation(SNOMED_TUMOR_CODE, SNOMED_T4_CODE),
        // N observation
        createObservation(SNOMED_NODE_CODE, SNOMED_N3_CODE),
        // M observation
        createObservation(SNOMED_METASTASIS_CODE, SNOMED_M1_CODE),
        // T observation
        createObservation(SNOMED_TUMOR_CODE, SNOMED_T1_CODE),
        // N observation
        createObservation(SNOMED_NODE_CODE, SNOMED_N1_CODE),
        // M observation
        createObservation(SNOMED_METASTASIS_CODE, SNOMED_M0_CODE)
      ])
    ).toEqual({
      tumor: 4,
      node: 3,
      metastasis: 1
    });
    // ...so check each field individually as well
    expect(
      extractTNM([
        createObservation(SNOMED_TUMOR_CODE, SNOMED_T4_CODE),
        createObservation(SNOMED_TUMOR_CODE, SNOMED_T1_CODE)
      ])
    ).toEqual({
      tumor: 4
    });
    expect(
      extractTNM([
        createObservation(SNOMED_NODE_CODE, SNOMED_N3_CODE),
        createObservation(SNOMED_NODE_CODE, SNOMED_N1_CODE)
      ])
    ).toEqual({
      node: 3
    });
    expect(
      extractTNM([
        createObservation(SNOMED_METASTASIS_CODE, SNOMED_M1_CODE),
        createObservation(SNOMED_METASTASIS_CODE, SNOMED_M0_CODE)
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
          code: {
            coding: [
              {
                system: SNOMED_SYSTEM_URI,
                code: SNOMED_NODE_CODE
              }
            ]
          },
          status: 'final',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://example.com/ignore-this',
                code: SNOMED_T1_CODE
              }
            ]
          }
        },
        // Code that's valid FHIR but will never match anything
        createObservation(SNOMED_NODE_CODE, 'invalid SNOMED code'),
        // Non-observation resource that should be ignored
        {
          resourceType: 'Patient'
        },
        // Tumor observation
        createObservation(SNOMED_TUMOR_CODE, SNOMED_T1_CODE),
        // Node observation
        createObservation(SNOMED_NODE_CODE, SNOMED_N1_CODE),
        // Metastasis observation
        createObservation(SNOMED_METASTASIS_CODE, SNOMED_M0_CODE)
      ])
    ).toEqual({
      tumor: 1,
      node: 1,
      metastasis: 0
    });
  });
  it('ignores code/value mismatches when checking codes', () => {
    expect(
      extractTNM([
        // N code as a value to a T code
        createObservation(SNOMED_TUMOR_CODE, SNOMED_N1_CODE)
      ])
    ).toEqual({});
    expect(
      extractTNM([
        // M code as a value to a N code
        createObservation(SNOMED_NODE_CODE, SNOMED_M0_CODE)
      ])
    ).toEqual({});
    expect(
      extractTNM([
        // N code as a value to a T code
        createObservation(SNOMED_TUMOR_CODE, SNOMED_N1_CODE),
        // Use something invalid for the observed thing code
        createObservation('invalid', SNOMED_N2_CODE),
        createObservation(SNOMED_NODE_CODE, SNOMED_N3_CODE)
      ])
    ).toEqual({
      node: 3
    });
  });
  it('returns code/value mismatches when not checking codes', () => {
    expect(
      extractTNM(
        [
          // N code as a value to a T code
          createObservation(SNOMED_TUMOR_CODE, SNOMED_N1_CODE)
        ],
        { checkCodes: false }
      )
    ).toEqual({
      node: 1
    });
    expect(
      extractTNM(
        [
          // M code as a value to a N code
          createObservation(SNOMED_NODE_CODE, SNOMED_M0_CODE)
        ],
        { checkCodes: false }
      )
    ).toEqual({
      metastasis: 0
    });
    expect(
      extractTNM(
        [
          // N code as a value to a T code
          createObservation(SNOMED_TUMOR_CODE, SNOMED_N1_CODE),
          // Use something invalid for the observed thing code
          createObservation('invalid', SNOMED_N2_CODE),
          createObservation(SNOMED_NODE_CODE, SNOMED_N3_CODE)
        ],
        { checkCodes: false }
      )
    ).toEqual({
      node: 1
    });
  });
  it('handles Observations without valueCodeableConcepts', () => {
    expect(
      extractTNM([
        {
          resourceType: 'Observation',
          code: {
            coding: [
              {
                system: SNOMED_SYSTEM_URI,
                code: SNOMED_METASTASIS_CODE
              }
            ]
          },
          status: 'final',
          valueBoolean: true
        }
      ])
    ).toEqual({});
  });
});
