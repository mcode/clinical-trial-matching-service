// FHIR data types supporting ResearchStudy

import { BaseResource } from './bundle';

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

/**
 * Utility function to convert a list of strings into a list of CodeableConcepts.
 *
 * @param conditions a list of strings to convert to CodeableConcepts
 */
export function convertStringArrayToCodeableConcept(conditions: string): CodeableConcept[] {
  const jsonConditions: string[] = JSON.parse(conditions) as string[];
  const fhirConditions: CodeableConcept[] = [];
  for (const condition of jsonConditions) {
    fhirConditions.push({ text: condition });
  }
  return fhirConditions;
}

export type Container<TContainer, TContained, K extends keyof TContainer> = {
  [P in K]: Array<TContained> | undefined
};
export function addToContainer<TContainer, TContained, K extends keyof TContainer>(
  container: Container<TContainer, TContained, K>,
  propertyName: K,
  item: TContained
): void {
  if (!container[propertyName]) {
    container[propertyName] = [];
  }
  // I'm unclear why TypeScript won't make this inference when the type is
  // optional, but it won't
  (container[propertyName] as Array<TContained>).push(item);
}

export function createReferenceTo(resource: BaseResource): Reference {
  const reference: Reference = {};
  if (resource.id) {
    reference.reference = '#' + resource.id;
  }
  if (resource.resourceType) {
    reference.type = resource.resourceType;
  }
  return reference;
}

/**
 * A basic ResearchStudy implementation, this provides helper methods for
 * doing things like adding contact information.
 */
export class ResearchStudy implements ResearchStudy {
  resourceType = 'ResearchStudy' as const;
  id?: string;
  identifier?: Identifier[];
  title?: string;
  status?: string;
  phase?: CodeableConcept;
  category?: CodeableConcept[];
  condition?: CodeableConcept[];
  contact?: ContactDetail[];
  keyword?: CodeableConcept[];
  location?: CodeableConcept[];
  description?: string;
  arm?: Arm[];
  objective?: Objective[];
  enrollment?: Reference[];
  sponsor?: Reference;
  principalInvestigator?: Reference;
  site?: Reference[];
  contained?: ContainedResource[];

  constructor(id: string | number) {
    if (typeof id === 'number') {
      // This is mostly for convenience of using array indices as IDs
      this.id = 'study-' + id;
    } else {
      // Pointless toString is to support use from non-TypeScript apps that
      // try and use something that isn't a string.
      this.id = id.toString();
    }
    // This is done as a closure to avoid adding an enumerable property that
    // would show up in JSON output
    this.createReferenceId = (function() {
      let generatedId = 0;
      return function(prefix = 'resource') {
        return prefix + '-' + (generatedId++);
      };
    })();
  }

  /**
   * Add a contained resource, returning a reference to it that can be added
   * elsewhere.
   * @param resource the resource to add
   */
  addContainedResource(resource: ContainedResource): Reference {
    if (!this.contained)
      this.contained = [];
    this.contained.push(resource);
    return createReferenceTo(resource);
  }

  /**
   * Creates a new, probably unique ID for a contained resource. (At present
   * this doesn't go through the contained resources to ensure the ID is
   * actually unique.)
   * @param prefix the prefix for the reference
   */
  createReferenceId: (prefix?: string) => string;

  /**
   * Adds a contact to the contact field.
   *
   * @param contact the contact to add
   */
  addContact(contact: ContactDetail): void;
  /**
   * Adds a contact to the contact field.
   *
   * @param name the name of the contact
   * @param phone the work phone number of the contact
   * @param email the work email of the contact
   */
  addContact(name: string, phone?: string, email?: string): void;
  addContact(nameOrContact: ContactDetail | string, phone?: string, email?: string): void {
    const contact: ContactDetail = typeof nameOrContact === 'string' ? {} : nameOrContact;
    if (typeof nameOrContact === 'string') {
      contact.name = nameOrContact;
      if (phone || email) {
        const telecoms: ContactPoint[] = [];
        if (phone) {
          telecoms.push({ system: 'phone', value: phone, use: 'work' });
        }
        if (email) {
          telecoms.push({ system: 'email', value: email, use: 'work' });
        }
        contact.telecom = telecoms;
      }
    }
    if (!this.contact)
      this.contact = [];
    this.contact.push(contact);
  }

  /**
   * Adds a site as a contained resource.
   * @param name the name of the site to add
   * @return the location added
   */
  addSite(name: string, phone?: string, email?: string): Location;

  addSite(location: Location): Location;

  addSite(nameOrLocation: string | Location, phone?: string, email?: string): Location {
    const location: Location = typeof nameOrLocation === 'string' ?
      { resourceType: 'Location', id: this.createReferenceId('location'), name: nameOrLocation } :
      nameOrLocation;
    if (typeof nameOrLocation === 'string') {
      // Also possibly add the telecoms
      if (phone) {
        addToContainer<Location, ContactPoint, 'telecom'>(location, 'telecom', { system: 'phone', value: phone, use: 'work' });
      }
      if (email) {
        addToContainer<Location, ContactPoint, 'telecom'>(location, 'telecom', { system: 'email', value: email, use: 'work' });
      }
    }
    addToContainer<ResearchStudy, Reference, 'site'>(this, 'site', this.addContainedResource(location));
    return location;
  }
}

export default ResearchStudy;
