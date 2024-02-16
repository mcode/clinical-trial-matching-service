import { Phase, RecruitmentStatus, Status, Study } from './ctg-api';
import {
  CodeableConcept,
  ContactDetail,
  ContactPoint,
  Group,
  Location,
  PlanDefinition,
  Reference,
  ResearchStudy,
  ResearchStudyArm
} from 'fhir/r4';
import { isFhirDate } from './fhir-type-guards';
import { addContainedResource, addToContainer } from './research-study';
import { CLINICAL_TRIAL_IDENTIFIER_CODING_SYSTEM_URL } from './clinicaltrialsgov';

const PHASE_MAP = new Map<Phase, string>([
  [Phase.NA, 'n-a'],
  [Phase.EARLY_PHASE1, 'early-phase-1'],
  [Phase.PHASE1, 'phase-1'],
  [Phase.PHASE2, 'phase-2'],
  [Phase.PHASE3, 'phase-3'],
  [Phase.PHASE4, 'phase-4']
]);

export function convertToResearchStudyPhase(phase: Phase): string | undefined {
  return PHASE_MAP.get(phase);
}

const CLINICAL_STATUS_MAP = new Map<Status, ResearchStudy['status']>([
  [Status.ACTIVE_NOT_RECRUITING, 'closed-to-accrual'],
  [Status.COMPLETED, 'completed'],
  // FIXME: This does not appear to have a proper mapping
  [Status.ENROLLING_BY_INVITATION, 'active'],
  [Status.NOT_YET_RECRUITING, 'approved'],
  [Status.RECRUITING, 'active'],
  [Status.SUSPENDED, 'temporarily-closed-to-accrual'],
  [Status.TERMINATED, 'administratively-completed'],
  [Status.WITHDRAWN, 'withdrawn'],
  [Status.AVAILABLE, 'completed'],
  [Status.NO_LONGER_AVAILABLE, 'closed-to-accrual'],
  [Status.TEMPORARILY_NOT_AVAILABLE, 'temporarily-closed-to-accrual'],
  [Status.APPROVED_FOR_MARKETING, 'completed'],
  // FIXME: This does not appear to have a proper mapping
  [Status.WITHHELD, 'in-review'],
  // FIXME: This does not appear to have a proper mapping
  [Status.UNKNOWN, 'in-review']
]);

export function convertClincalStudyStatusToFHIRStatus(status: Status): ResearchStudy['status'] | undefined {
  return CLINICAL_STATUS_MAP.get(status);
}

const LOCATION_STATUS_MAP = new Map<RecruitmentStatus, Location['status']>([
  [RecruitmentStatus.ACTIVE_NOT_RECRUITING, 'active'],
  [RecruitmentStatus.COMPLETED, 'inactive'],
  [RecruitmentStatus.ENROLLING_BY_INVITATION, 'active'],
  [RecruitmentStatus.NOT_YET_RECRUITING, 'inactive'],
  [RecruitmentStatus.RECRUITING, 'active'],
  [RecruitmentStatus.SUSPENDED, 'suspended'],
  [RecruitmentStatus.TERMINATED, 'inactive'],
  [RecruitmentStatus.WITHDRAWN, 'inactive'],
  [RecruitmentStatus.AVAILABLE, 'active']
]);

export function convertRecruitmentStatusToLocationStatus(status: RecruitmentStatus): Location['status'] | undefined {
  return LOCATION_STATUS_MAP.get(status);
}

function convertToTitleCase(str: string): string {
  return str
    .replace(/([A-Z]+)/g, (s) => (s.length > 1 ? s.substring(0, 1) + s.substring(1).toLowerCase() : s))
    .replace(/_/g, ' ');
}

function convertArrayToCodeableConcept(trialConditions: string[]): CodeableConcept[] {
  const fhirConditions: CodeableConcept[] = [];
  for (const condition of trialConditions) {
    fhirConditions.push({ text: condition });
  }
  return fhirConditions;
}

/**
 *
 * @param study the study to base the result on
 * @param result if given, keeps whatever data is already in the result that
 *   isn't in the ClinicalTrials.gov study object (all other data will be
 *   overwritten on the passed object)
 * @returns the resulting study, either a new object if result was
 *   null/undefined, or the passed ResearchStudy
 */
export function createResearchStudyFromClinicalStudy(study: Study, result?: ResearchStudy): ResearchStudy {
  if (!result) {
    result = {
      resourceType: 'ResearchStudy',
      status: 'active'
    };
  }

  const protocolSection = study.protocolSection;
  // If there is no protocol section, we can't do anything.
  if (!protocolSection) {
    return result;
  }

  // Fill out basic information
  const identificationModule = protocolSection.identificationModule;
  if (identificationModule) {
    const nctId = identificationModule.nctId;
    if (nctId) {
      result.identifier = [
        {
          system: CLINICAL_TRIAL_IDENTIFIER_CODING_SYSTEM_URL,
          value: nctId
        }
      ];
    }
    const briefTitle = identificationModule.briefTitle;
    if (briefTitle) {
      result.title = briefTitle;
    } else {
      const officialTitle = identificationModule.officialTitle;
      if (officialTitle) {
        result.title = officialTitle;
      }
    }
  }

  const eligibility = protocolSection.eligibilityModule;
  if (eligibility) {
    const criteria = eligibility.eligibilityCriteria;
    if (criteria) {
      const group: Group = { resourceType: 'Group', id: 'group' + result.id, type: 'person', actual: false };
      const reference = addContainedResource(result, group);
      reference.display = criteria;
      result.enrollment = [reference];
    }
  }
  const briefSummary = protocolSection.descriptionModule?.briefSummary;
  if (briefSummary) {
    result.description = briefSummary;
  }

  const phase = protocolSection.designModule?.phases;
  if (phase && phase.length > 0) {
    // For now, just grab whatever the first phase is
    // TODO: handle the somewhat weirder "phase-1-phase-2" items
    const code = convertToResearchStudyPhase(phase[0]);
    if (code) {
      const display = code.replace(/-/g, ' ');
      result.phase = {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/research-study-phase',
            code: code,
            display: display
          }
        ],
        text: display
      };
    }
  }

  // ------- Category
  // Since we may not have all of the Study design in the result, we need to do a merge of data
  const categories: CodeableConcept[] = [];

  const studyType = study.protocolSection?.designModule?.studyType;
  if (studyType) {
    categories.push({ text: 'Study Type: ' + convertToTitleCase(studyType) });
  }

  const designInfo = protocolSection.designModule?.designInfo;
  if (designInfo) {
    if (designInfo.interventionModel) {
      categories.push({ text: 'Intervention Model: ' + convertToTitleCase(designInfo.interventionModel) });
    } else if (designInfo.interventionModelDescription) {
      categories.push({ text: 'Intervention Model: ' + designInfo.interventionModelDescription });
    }

    if (designInfo.primaryPurpose) {
      categories.push({ text: 'Primary Purpose: ' + convertToTitleCase(designInfo.primaryPurpose) });
    }

    const maskingInfo = designInfo.maskingInfo;
    if (maskingInfo) {
      // It's unclear exactly how to convert this
      const masking = maskingInfo.masking ? convertToTitleCase(maskingInfo.masking) : maskingInfo.maskingDescription;
      if (masking) {
        categories.push({ text: 'Masking: ' + masking });
      }
    }

    if (designInfo.allocation) {
      categories.push({ text: 'Allocation: ' + convertToTitleCase(designInfo.allocation) });
    }

    if (designInfo.timePerspective) {
      categories.push({ text: 'Time Perspective: ' + convertToTitleCase(designInfo.timePerspective) });
    }

    if (designInfo.observationalModel) {
      categories.push({ text: 'Observation Model: ' + convertToTitleCase(designInfo.observationalModel) });
    }
  }

  if (categories.length >= 1) result.category = categories;
  // ------- Category

  const overallStatus = protocolSection.statusModule?.lastKnownStatus;
  if (overallStatus) {
    const status = convertClincalStudyStatusToFHIRStatus(overallStatus);
    if (typeof status !== 'undefined') result.status = status;
  }

  if (protocolSection.conditionsModule?.conditions) {
    result.condition = convertArrayToCodeableConcept(protocolSection.conditionsModule?.conditions);
  }

  const locations = protocolSection.contactsLocationsModule?.locations;
  if (locations) {
    let index = 0;
    for (const location of locations) {
      if (typeof location === 'object' && location != null) {
        const fhirLocation: Location = { resourceType: 'Location', id: 'location-' + index++ };
        if (location.status) fhirLocation.status = convertRecruitmentStatusToLocationStatus(location.status);
        if (location.facility) fhirLocation.name = location.facility;
        if (location.city && location.country) {
          // Also add the address information
          fhirLocation.address = { use: 'work', city: location.city, country: location.country };
          if (location.state) {
            fhirLocation.address.state = location.state;
          }
          if (location.zip) {
            fhirLocation.address.postalCode = location.zip;
          }
        }
        // If we have an exact GPS coordinate, add that, too
        const geoPoint = location.geoPoint;
        if (geoPoint && typeof geoPoint.lat === 'number' && typeof geoPoint.lon === 'number') {
          fhirLocation.position = {
            longitude: geoPoint.lon,
            latitude: geoPoint.lat
          };
        }
        if (location.contacts) {
          for (const contact of location.contacts) {
            if (contact.email) {
              addToContainer<Location, ContactPoint, 'telecom'>(fhirLocation, 'telecom', {
                system: 'email',
                value: contact.email,
                use: 'work'
              });
            }
            if (contact.phone) {
              addToContainer<Location, ContactPoint, 'telecom'>(fhirLocation, 'telecom', {
                system: 'phone',
                value: contact.phone,
                use: 'work'
              });
            }
          }
        }
        addToContainer<ResearchStudy, Reference, 'site'>(result, 'site', addContainedResource(result, fhirLocation));
      }
    }
  }

  const armGroups = protocolSection.armsInterventionsModule?.armGroups;
  if (armGroups) {
    for (const studyArm of armGroups) {
      const label = studyArm.label;
      if (label) {
        const arm: ResearchStudyArm = {
          name: label,
          ...(studyArm.type && {
            type: {
              coding: [
                {
                  // It's unclear if there is any coding system for this, so for now, make it look like FHIR
                  code: studyArm.type.replace(/_/g, '-').toLowerCase(),
                  display: convertToTitleCase(studyArm.type)
                }
              ],
              text: convertToTitleCase(studyArm.type)
            }
          }),
          ...(studyArm.description && { description: studyArm.description })
        };

        addToContainer<ResearchStudy, ResearchStudyArm, 'arm'>(result, 'arm', arm);
      }
    }
  }

  const interventions = protocolSection.armsInterventionsModule?.interventions;
  if (interventions) {
    let index = 0;
    for (const intervention of interventions) {
      if (intervention.armGroupLabels) {
        for (const armGroupLabel of intervention.armGroupLabels) {
          let plan: PlanDefinition = { resourceType: 'PlanDefinition', status: 'unknown', id: 'plan-' + index++ };

          plan = {
            ...plan,
            ...(intervention.description && { description: intervention.description }),
            ...(intervention.name && { title: intervention.name }),
            ...(intervention.otherNames &&
              intervention.otherNames.length > 0 && { subtitle: intervention.otherNames[0] }),
            ...(intervention.type && { type: { text: convertToTitleCase(intervention.type) } }),
            ...{ subjectCodeableConcept: { text: armGroupLabel } }
          };

          addToContainer<ResearchStudy, Reference, 'protocol'>(result, 'protocol', addContainedResource(result, plan));
        }
      } else {
        let plan: PlanDefinition = { resourceType: 'PlanDefinition', status: 'unknown', id: 'plan-' + index++ };

        plan = {
          ...plan,
          ...(intervention.description && { description: intervention.description }),
          ...(intervention.name && { title: intervention.name }),
          ...(intervention.otherNames &&
            intervention.otherNames.length > 0 && { subtitle: intervention.otherNames[0] }),
          ...(intervention.type && { type: { text: convertToTitleCase(intervention.type) } })
        };

        addToContainer<ResearchStudy, Reference, 'protocol'>(result, 'protocol', addContainedResource(result, plan));
      }
    }
  }

  const contacts = protocolSection.contactsLocationsModule?.centralContacts;

  if (contacts) {
    for (const contact of contacts) {
      if (contact != undefined) {
        const contactName = contact.name;
        if (contactName) {
          const fhirContact: ContactDetail = { name: contactName };
          if (contact.email) {
            addToContainer<ContactDetail, ContactPoint, 'telecom'>(fhirContact, 'telecom', {
              system: 'email',
              value: contact.email,
              use: 'work'
            });
          }
          if (contact.phone) {
            addToContainer<ContactDetail, ContactPoint, 'telecom'>(fhirContact, 'telecom', {
              system: 'phone',
              value: contact.phone,
              use: 'work'
            });
          }
          addToContainer<ResearchStudy, ContactDetail, 'contact'>(result, 'contact', fhirContact);
        }
      }
    }
  }
  const startDate = protocolSection.statusModule?.startDateStruct?.date;
  const completionDate = protocolSection.statusModule?.completionDateStruct?.date;
  if (startDate || completionDate) {
    // Set the period object as appropriate
    const period = {
      ...(startDate && isFhirDate(startDate) && { start: startDate }),
      ...(completionDate && isFhirDate(completionDate) && { end: completionDate })
    };

    if (Object.keys(period).length != 0) result.period = period;
  }

  return result;
}
