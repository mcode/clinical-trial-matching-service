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
 * @returns a corresponding cancer stage number
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
