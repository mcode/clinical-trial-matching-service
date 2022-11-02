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
