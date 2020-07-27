// FHIR data types supporting ResearchStudy
export interface Identifier {
  use?: string;
  system?: string;
  value?: string;
}

export interface CodeableConcept {
  coding?: { system?: string; code?: string; display?: string }[];
  text?: string;
}

export interface ContactDetail {
  name?: string;
  telecom?: Telecom[];
}

export interface Telecom {
  system?: string;
  value?: string;
  use?: string;
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
export interface Group {
  resourceType?: string;
  id?: string;
  type?: string;
  actual?: boolean;
}

export interface Location {
  resourceType?: string;
  id?: string;
  name?: string;
  telecom?: Telecom[];
  position?: { longitude?: number; latitude?: number };
}

export interface Organization {
  resourceType?: string;
  id?: string;
  name?: string;
}

export interface Practitioner {
  resourceType?: string;
  id?: string;
  name?: HumanName[];
}

// FHIR data types supporting resources contained in ResearchStudy
export interface HumanName {
  use?: string;
  text: string;
}

// ResearchStudy implementation
export class ResearchStudy {
  resourceType = 'ResearchStudy';
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
  description?: string; // Should actually be markdown
  arm?: Arm[];
  objective?: Objective[];
  enrollment?: Reference[];
  sponsor?: Reference;
  principalInvestigator?: Reference;
  site?: Reference[];
  contained?: (Group | Location | Organization | Practitioner)[];

  constructor(id: string | number) {
    if (typeof id === 'number') {
      // This is mostly for convenience of using array indices as IDs
      this.id = 'study-' + id;
    } else {
      // Pointless toString is to support use from non-TypeScript apps that
      // try and use something that isn't a string.
      this.id = id.toString();
    }
  }

  convertStringArrayToCodeableConcept(tsConditions: string): CodeableConcept[] {
    const jsonConditions: string[] = JSON.parse(tsConditions) as string[];
    const fhirConditions: CodeableConcept[] = [];
    for (const condition of jsonConditions) {
      fhirConditions.push({ text: condition });
    }
    return fhirConditions;
  }

  setContact(name: string, phone: string, email: string): ContactDetail[] {
    const contact: ContactDetail = {};
    if (name) {
      contact.name = name;
    }
    if (phone || email) {
      const telecoms: Telecom[] = [];
      if (phone) {
        telecoms.push({ system: 'phone', value: phone, use: 'work' });
      }
      if (email) {
        telecoms.push({ system: 'email', value: email, use: 'work' });
      }
      contact.telecom = telecoms;
    }
    return [contact];
  }
}

export default ResearchStudy;