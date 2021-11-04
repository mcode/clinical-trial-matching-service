/**
 * This module contains type definitions for various FHIR types. At some point
 * these types should likely be replaced with an open source library, but as
 * we're currently only using a subset of FHIR, this covers only that subset.
 */
 import { fhirclient } from 'fhirclient/lib/types';

/**
 * Mark URLs
 */
type URLString = string;

export interface BaseResource {
  resourceType: string;
  id?: string;
  meta?: {profile: string[], lastUpdated: string};
  component?: {interpretation?: CodingList, valueCodeableConcept?: CodingList}[];
  interpretation?: CodingList;
  valueCodeableConcept?: CodingList;
  code?: CodingList;
  extension?: Extension[];
}

interface CodingList {
  coding: Coding[];
}

interface Extension {
  url?: string;
  valueCodeableConcept?: CodingList;
}

export interface BundleEntry {
  resource: Resource;
  fullUrl?: URLString;
  search?: SearchResult;
}

/**
 * Describes a Coding object.
 */
export interface Coding {
  system: string;
  code: string;
  display?: string;
}

/**
 * The search entry mode valueset (from https://www.hl7.org/fhir/valueset-search-entry-mode.html).
 */
export type SearchEntryMode = 'match' | 'include' | 'outcome';

export interface SearchResult {
  mode?: SearchEntryMode;
  score?: number;
}

export type BundleType =
  | 'document'
  | 'message'
  | 'transaction'
  | 'transaction-response'
  | 'batch'
  | 'batch-response'
  | 'history'
  | 'searchset'
  | 'collection';

export const BUNDLE_TYPES = new Set<BundleType>([
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

export interface Bundle extends BaseResource {
  resourceType: 'Bundle';
  type: BundleType;
  entry: BundleEntry[];
}

/**
 * A Bundle that is a Collection.
 */
export interface Collection extends Bundle {
  type: 'collection';
}

/**
 * A Bundle that is a SearchSet.
 */
export interface SearchSet extends Bundle {
  type: 'searchset';
}

export function isBundle(o: unknown): o is Bundle {
  if (typeof o !== 'object' || o === null) return false;
  const other = o as Bundle;
  return other.resourceType === 'Bundle' && BUNDLE_TYPES.has(other.type) && Array.isArray(other.entry);
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
  clinicalStatus: Code;
  bodySite: Code;
}

export interface Observation extends BaseResource {
  resourceType: 'Observation';
  valueCodeableConcept: Code;
}

export interface Patient extends BaseResource {
  resourceType: 'Patient';
  birthDate: string;
  gender?: string;
}

export interface Procedure extends BaseResource {
  resourceType: 'Procedure';
  code: Code;
  bodySite?: CodingList[];
  reasonReference?: Reference;
}

export interface MedicationStatement extends BaseResource {
  resourceType: 'MedicationStatement';
  code: Code;
}

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

export type PublicationStatus = 'draft' | 'active' | 'retired' | 'unknown';

export interface PlanDefinition extends BaseResource {
  resourceType: 'PlanDefinition',
  status: PublicationStatus,
  type?: CodeableConcept,
  title?: string,
  subtitle?: string,
  description?: string,
  subjectCodeableConcept?: CodeableConcept 
}

// FHIR resources contained within ResearchStudy
export interface Group extends BaseResource {
  resourceType: 'Group';
  type?: string;
  actual?: boolean;
}

export type AddressUse = 'home' | 'work' | 'temp' | 'old' | 'billing';
export type AddressType = 'postal' | 'physical' | 'both';

export interface Address {
  use?: AddressUse;
  type?: AddressType;
  text?: string;
  line?: string[];
  city?: string;
  district?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  period?: string;
}

export interface Location extends BaseResource {
  resourceType: 'Location';
  name?: string;
  address?: Address;
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

export type ContainedResource = Group | Location | Organization | Practitioner | PlanDefinition;

/**
 * Codes from https://www.hl7.org/fhir/codesystem-research-study-status.html
 */
export type ResearchStudyStatus =
  | 'active'
  | 'administratively-completed'
  | 'approved'
  | 'closed-to-accrual'
  | 'closed-to-accrual-and-intervention'
  | 'completed'
  | 'disapproved'
  | 'in-review'
  | 'temporarily-closed-to-accrual'
  | 'temporarily-closed-to-accrual-and-intervention'
  | 'withdrawn';

export interface ResearchStudy extends BaseResource {
  resourceType: 'ResearchStudy';
  identifier?: Identifier[];
  title?: string;
  protocol?: Reference[];
  status?: ResearchStudyStatus;
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

export type Resource = Condition | Parameters | Observation | Patient | Procedure | MedicationStatement | ResearchStudy;

export function isResearchStudy(o: unknown): o is ResearchStudy {
  if (typeof o !== 'object' || o === null) {
    return false;
  }
  return (o as ResearchStudy).resourceType === 'ResearchStudy';
}
