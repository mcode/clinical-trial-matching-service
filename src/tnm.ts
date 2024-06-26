import { CodeableConcept, FhirResource, Observation } from 'fhir/r4';
import TNM_CODES, {
  MetastasisStage,
  NodeStage,
  TumorStage,
  TNMStage,
  TNMCodes,
  TNM_SNOMED_TUMOR_CODES,
  TNM_SNOMED_NODE_CODES,
  TNM_SNOMED_METASTASIS_CODES
} from './tnm-codes';
import { SNOMED_SYSTEM_URI } from './fhir-constants';
import { codeableConceptContainsCode } from './fhir-util';

export type CancerStage = 0 | 1 | 2 | 3 | 4;

export interface TNMField {
  /**
   * Upper case parameter field
   */
  parameter: string;
  /**
   * The value after this field, *may be null* if there is no number (e.g., Tis)
   */
  value: number | null;
  /**
   * A set of lowercase letters the modify the code that came before the field.
   */
  prefixModifiers: string;
  /**
   * An optional set of suffix modifiers that came after the field.
   */
  suffixModifiers: string;
}

/**
 * Parses a given string into TNM fields. These fields should be space delimited (e.g., "T1 N0 M0"). If nothing can
 * be pulled out of the string, an empty array may be returned.
 * @param str the string to parse
 */
export function parseTNM(str: string): TNMField[] {
  // First, split by whitespace
  const fields = str.split(/\s+/);
  // Then parse the individual fields
  return fields
    .map<TNMField | null>((field) => {
      const m = /^([a-z]*)([A-Z])(\d?)([a-z]*)$/.exec(field);
      if (m) {
        return {
          parameter: m[2],
          value: m[3] ? parseInt(m[3]) : null,
          prefixModifiers: m[1],
          suffixModifiers: m[4]
        };
      } else {
        return null;
      }
    })
    .filter((value): value is TNMField => value !== null);
}

/**
 * Converts a set of TNM values into cancer stages.
 * @param tnm a space-separated set of TNM values
 * @returns the converted cancer stage, or null if no cancer was given, or
 * undefined if the TNM values couldn't be parsed
 */
export function convertTNMToCancerStage(tnm: string): CancerStage | null | undefined {
  // First, attempt to parse this at all
  let t: number | undefined = undefined;
  let n: number | undefined = undefined;
  let m: number | undefined = undefined;
  for (const field of parseTNM(tnm)) {
    switch (field.parameter) {
      case 'T':
        if (field.value !== null) {
          t = field.value;
        } else if (field.suffixModifiers === 'is') {
          t = 0.5;
        }
        break;
      case 'N':
        if (field.value !== null) {
          n = field.value;
        }
        break;
      case 'M':
        if (field.value !== null) {
          m = field.value;
        }
        break;
      default:
      // Ignore this field
    }
  }
  if (typeof t === 'number' && typeof n === 'number' && typeof m === 'number') {
    return convertTNMValuesToCancerStage(t, n, m);
  } else {
    return undefined;
  }
}

/**
 * Converts a given set of TNM numbers to a corresponding cancer stage.
 * @param tumor the tumor number (0-4, with 0.5 being used for Tis)
 * @param node the node number
 * @param metastasis the metastasis number
 * @returns a corresponding cancer stage number, or null for "no cancer"
 */
export function convertTNMValuesToCancerStage(tumor: number, node: number, metastasis: number): CancerStage | null {
  if (metastasis > 0) {
    return 4;
  }
  if (node > 0) {
    return 3;
  }
  if (tumor > 2) {
    return 2;
  }
  if (tumor >= 1) {
    return 1;
  }
  if (tumor === 0) {
    // This is T0 N0 M0 which means "no tumor found" which doesn't really make
    // sense
    return null;
  }
  return 0;
}

export interface TNMStageValue {
  type: 'T' | 'N' | 'M';
  stage: TNMStage;
}

/**
 * Attempts to convert the given codeable concept into a TNM stage value. The
 * stage value may be a single T, N, or M stage value.
 *
 * If the code cannot be converted, this returns undefined.
 * @param concept the concept to decode
 */
export function convertCodeableConceptToTNM(concept: CodeableConcept): TNMStageValue | undefined {
  const codes = concept.coding;
  if (Array.isArray(codes)) {
    // Have codes to check
    for (const code of codes) {
      // See if we have a code to check at all
      if (code.system && code.code) {
        // See if this code exists
        for (const type in TNM_CODES) {
          const systems = TNM_CODES[type as keyof TNMCodes];
          if (code.system in systems && code.code in systems[code.system]) {
            const value = systems[code.system][code.code];
            return {
              type: type as keyof TNMCodes,
              stage: value
            };
          }
        }
      }
    }
  }
  // If we've fallen through, we never found a matching code, so return undefined
  // (which will happen automatically, but make it explicit anyway)
  return undefined;
}

export interface TNMValues {
  tumor?: TumorStage;
  node?: NodeStage;
  metastasis?: MetastasisStage;
}

export interface ExtractTNMOptions {
  checkCodes?: boolean;
}

/**
 * Checks the code from a given observation to check
 * @param observation the observation to check
 */
function expectedTNM(observation: Observation): 'T' | 'N' | 'M' | null {
  const code = observation.code;
  if (codeableConceptContainsCode(code, SNOMED_SYSTEM_URI, TNM_SNOMED_TUMOR_CODES)) {
    return 'T';
  }
  if (codeableConceptContainsCode(code, SNOMED_SYSTEM_URI, TNM_SNOMED_NODE_CODES)) {
    return 'N';
  }
  if (codeableConceptContainsCode(code, SNOMED_SYSTEM_URI, TNM_SNOMED_METASTASIS_CODES)) {
    return 'M';
  }
  return null;
}

/**
 * Extracts a set of TNM values (if possible) from the given set of resources.
 * This will attempt to extract the first TNM values found in the list. If
 * multiple resources define a TNM value, only the first found is used. So if
 * there are two resources, the first which gives a value of T1, and the second
 * that gives a value of T2, this returns `{ tumor: 1 }`.
 * @param resources the resources to extra from
 * @returns the TNM values that could be extracted
 */
export function extractTNM(resources: FhirResource[], options?: ExtractTNMOptions): TNMValues {
  // Default to checking codes
  const checkCodes = options?.checkCodes ?? true;
  const result: TNMValues = {};
  for (const resource of resources) {
    if (resource.resourceType === 'Observation') {
      // TODO: Ignore resources with status = 'entered-in-error'?
      // Are there any other statuses that should be ignored?
      const observation = resource as Observation;
      const expectedType = checkCodes ? expectedTNM(observation) : null;
      if (checkCodes && expectedType === null) {
        // No code found, skip this resource
        continue;
      }
      if (observation.valueCodeableConcept) {
        // Try and look this up
        const value = convertCodeableConceptToTNM(observation.valueCodeableConcept);
        if (value) {
          if (checkCodes && value.type != expectedType) {
            // If this doesn't match, skip this
            continue;
          }
          switch (value.type) {
            case 'T':
              if (result.tumor === undefined) result.tumor = value.stage;
              break;
            case 'N':
              // Assume the values coming out of convertCodeableConceptToTNM are right
              if (result.node === undefined) result.node = value.stage as NodeStage;
              break;
            case 'M':
              if (result.metastasis === undefined) result.metastasis = value.stage as MetastasisStage;
              break;
          }
          // If we have all values, return immediately
          if (result.tumor !== undefined && result.node !== undefined && result.metastasis !== undefined) {
            return result;
          }
        }
      }
    }
  }
  return result;
}
