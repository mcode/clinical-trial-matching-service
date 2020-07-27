/**
 * This module contains type definitions for various FHIR types. At some point
 * these types should likely be replaced with an open source library, but as
 * we're currently only using a very small subset of FHIR, this covers only that
 * small subset.
 */

/**
 * Mark URLs
 */
type URLString = string;

export interface BaseResource {
  resourceType: string;
  id?: string;
}

export interface BundleEntry {
  resource: Resource;
  fullUrl?: URLString;
}

export interface Bundle extends BaseResource {
  resourceType: 'Bundle';
  type: 'collection';
  entry: BundleEntry[];
}

export function isBundle(o: unknown): o is Bundle {
  if (typeof o !== 'object') return false;
  const other = o as Bundle;
  return other.resourceType === 'Bundle' && other.type === 'collection' && Array.isArray(other.entry);
}

export interface Parameters extends BaseResource {
  resourceType: 'Parameters';
  parameter: { name: string; valueString: string }[];
}

export interface Code {
  coding: { system: URLString; code: string; display?: string }[];
  text?: string;
}

export interface Condition extends BaseResource {
  resourceType: 'Condition';
  code: Code;
}

export type Resource = Condition | Parameters;

export default Bundle;
