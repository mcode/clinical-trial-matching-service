/**
 * FHIR type guards for ensuring that objects match (at least to some degree) a
 * valid FHIR R4 type.
 */

import { Bundle, ResearchStudy } from 'fhir/r4';

const BUNDLE_TYPES = new Set<Bundle['type']>([
  'document',
  'message',
  'transaction',
  'transaction-response',
  'batch',
  'batch-response',
  'history',
  'searchset',
  'collection'
]);
export function isBundle(o: unknown): o is Bundle {
  if (typeof o !== 'object' || o === null) return false;
  const other = o as Bundle;
  return other.resourceType === 'Bundle' && BUNDLE_TYPES.has(other.type) && Array.isArray(other.entry);
}

export function isResearchStudy(o: unknown): o is ResearchStudy {
  if (typeof o !== 'object' || o === null) {
    return false;
  }
  return (o as ResearchStudy).resourceType === 'ResearchStudy';
}

/**
 * Determines if the given string is a valid FHIR date.
 * @param str the date string to check
 */
export function isFhirDate(str: string): boolean {
  // This RegExp is from the FHIR spec itself:
  // http://hl7.org/fhir/R4/datatypes.html#dateTime
  return /^([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)(-(0[1-9]|1[0-2])(-(0[1-9]|[1-2][0-9]|3[0-1])(T([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)(\.[0-9]+)?(Z|(\+|-)((0[0-9]|1[0-3]):[0-5][0-9]|14:00)))?)?)?$/.test(
    str
  );
}
