/**
 * Minimal type definitions for fhirpath
 */
declare module 'fhirpath' {
  /**
   * FHIRPath is an opaque object.
   */
  export type FHIRPath = Record<string, unknown>; //object;
  // This is effectively "any object"
  export type FHIRResource = { [key: string]: unknown };
  // This is almost certainly overly restrictive
  export type PathLookupResult = FHIRResource | string | number;

  export function parse(path: string): FHIRPath;
  export function compile(
    path: string,
    model: Record<string, unknown> //object
  ): (resource: FHIRResource, context?: Record<string, unknown>) => PathLookupResult[];
  export function evaluate(
    resource: FHIRResource | FHIRResource[],
    path: string,
    context?: Record<string, unknown>,
    model?: Record<string, unknown>
  ): PathLookupResult[];
}
