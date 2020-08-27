/**
 * This module contains type definitions for various FHIR types. At some point
 * these types should likely be replaced with an open source library, but as
 * we're currently only using a subset of FHIR, this covers only that subset.
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
  if (typeof o !== 'object' || o === null) return false;
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

export interface Observation extends BaseResource {
  resourceType: 'Observation';
  valueCodeableConcept: Code;
}

export interface Patient extends BaseResource {
  resourceType: 'Patient';
  birthDate: string;
}

export interface Procedure extends BaseResource {
  resourceType: 'Procedure';
  code: Code;
}

export interface MedicationStatement extends BaseResource {
  resourceType: 'MedicationStatement';
  code: Code;
}

export type Resource = Condition | Parameters | Observation | Patient | Procedure | MedicationStatement;

export interface Identifier {
  use?: string;
  system?: string;
  value?: string;
}

export interface CodeableConcept {
  coding?: { system?: string; code?: string; display?: string }[];
  text?: string;
}

export type ContactPointSystem = 'phone' | 'fax' | 'email' | 'pager' | 'url' | 'sms' | 'other';
export type ContactPointUse = 'home' | 'work' | 'temp' | 'old' | 'mobile';

export interface ContactDetail {
  name?: string;
  telecom?: ContactPoint[];
}

// Can't actually make a positive integer type on TypeScript but may as well document it as such
export type PositiveInteger = number;

export interface ContactPoint {
  system?: ContactPointSystem;
  value?: string;
  use?: ContactPointUse;
  rank?: PositiveInteger;
}

export interface Arm {
  name?: string;
  type?: CodeableConcept;
  description?: string;
}

export interface Objective {
  name?: string;
  type?: CodeableConcept;
}

export interface Reference {
  reference?: string;
  type?: string;
  display?: string;
}

// FHIR resources contained within ResearchStudy
export interface Group extends BaseResource {
  resourceType: 'Group';
  type?: string;
  actual?: boolean;
}

export interface Location extends BaseResource {
  resourceType: 'Location';
  name?: string;
  telecom?: ContactPoint[];
  position?: { longitude?: number; latitude?: number };
}

export interface Organization extends BaseResource {
  resourceType: 'Organization';
  name?: string;
}

export interface Practitioner extends BaseResource {
  resourceType: 'Practitioner';
  name?: HumanName[];
}

// FHIR data types supporting resources contained in ResearchStudy
export interface HumanName {
  use?: string;
  text: string;
}

export type ContainedResource = Group | Location | Organization | Practitioner;

export interface ResearchStudy extends BaseResource {
  resourceType: 'ResearchStudy';
  identifier?: Identifier[];
  title?: string;
  status?: string;
  phase?: CodeableConcept;
  category?: CodeableConcept[];
  condition?: CodeableConcept[];
  contact?: ContactDetail[];
  keyword?: CodeableConcept[];
  location?: CodeableConcept[];
  description?: string; // Should actually be markdown
  arm?: Arm[];
  objective?: Objective[];
  enrollment?: Reference[];
  sponsor?: Reference;
  principalInvestigator?: Reference;
  site?: Reference[];
  contained?: ContainedResource[];
}
