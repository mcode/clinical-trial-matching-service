import { Address, FhirResource, Location, ResearchStudy, PlanDefinition } from 'fhir/r4';
import { getContainedResource, ResearchStudy as ResearchStudyObj } from '../src/research-study';
import { createResearchStudyFromClinicalStudy } from '../src/study-fhir-converter';
import {
  DateType,
  DesignAllocation,
  DesignMasking,
  DesignTimePerspective,
  InterventionalAssignment,
  InterventionType,
  Location as StudyLocation,
  ObservationalModel,
  PrimaryPurpose,
  RecruitmentStatus,
  Status,
  Study,
  StudyType
} from '../src/ctg-api';

// Trial missing summary, inclusion/exclusion criteria, phase and study type
import * as sampleStudy from './data/NCT02513394.json';
import * as trialMissing from './data/resource.json';
import * as trialFilled from './data/complete_study.json';

describe('filling out a partial trial', () => {
  // Use the downloader to load the fixture data
  const study = trialMissing.entry[0].resource as ResearchStudy;
  let updatedTrial: ResearchStudy;

  beforeAll(async function () {
    updatedTrial = createResearchStudyFromClinicalStudy(sampleStudy as Study, study);
  });

  it('fills in inclusion criteria', () => {
    expect(updatedTrial.enrollment).toBeDefined();
    if (updatedTrial.enrollment) {
      // Prove enrollment exists to TypeScript
      expect(updatedTrial.enrollment.length).toBeGreaterThan(0);
      expect(updatedTrial.enrollment[0].display).toBeDefined();
    }
  });

  it('fills in phase', () => {
    const codings = updatedTrial.phase?.coding;
    expect(codings).toBeDefined();
    // For now, just one
    expect(codings?.length).toEqual(1);
    expect(codings?.[0].code).toEqual('phase-3');
  });

  it('fills in categories', () => {
    expect(updatedTrial.category).toBeDefined();
    if (updatedTrial.category) {
      expect(updatedTrial.category.length).toEqual(5);
      const categories = updatedTrial.category.map((item) => item.text);
      expect(categories).toHaveSize(5);
      expect(categories).toEqual(
        jasmine.arrayContaining([
          'Study Type: Interventional',
          'Intervention Model: Parallel',
          'Primary Purpose: Treatment',
          'Masking: None',
          'Allocation: Randomized'
        ])
      );
    }
  });

  it('overwrites existing categories', () => {
    const researchStudy = new ResearchStudyObj('id');
    researchStudy.category = [{ text: 'Study Type: Do Not Replace' }];

    createResearchStudyFromClinicalStudy({
      protocolSection: {
        designModule: {
          studyType: StudyType.INTERVENTIONAL,
          designInfo: {
            interventionModel: InterventionalAssignment.PARALLEL,
            primaryPurpose: PrimaryPurpose.TREATMENT,
            maskingInfo: {
              masking: DesignMasking.NONE
            },
            allocation: DesignAllocation.RANDOMIZED,
            timePerspective: DesignTimePerspective.OTHER,
            observationalModel: ObservationalModel.CASE_CONTROL
          }
        }
      }
    }, researchStudy);

    expect(researchStudy.category).toBeDefined();
    if (researchStudy.category) {
      expect(researchStudy.category).toHaveSize(7);
      const categories = researchStudy.category.map((item) => item.text);
      expect(categories).toHaveSize(7);
      expect(categories).toEqual(
        jasmine.arrayContaining([
          'Study Type: Interventional',
          'Intervention Model: Parallel',
          'Primary Purpose: Treatment',
          'Masking: None',
          'Allocation: Randomized',
          'Time Perspective: Other',
          'Observation Model: Case Control'
        ])
      );
    }
  });

  it('fills in arms', () => {
    expect(updatedTrial.arm).toBeDefined();
    if (updatedTrial.arm) {
      expect(updatedTrial.arm).toHaveSize(2);
      expect(updatedTrial.arm).toEqual(
        jasmine.arrayContaining([
          jasmine.objectContaining({
            name: 'Arm A',
            type: {
              coding: jasmine.arrayContaining([{ code: 'experimental', display: 'Experimental' }]),
              text: 'Experimental'
            },
            description:
              'Palbociclib at a dose of 125 mg orally once daily, Day 1 to Day 21 followed by 7 days off treatment in a 28-day cycle for a total duration of 2 years, in addition to standard adjuvant endocrine therapy for a duration of at least 5 years.'
          }),
          jasmine.objectContaining({
            name: 'Arm B',
            type: { coding: jasmine.arrayContaining([{ code: 'other', display: 'Other' }]), text: 'Other' },
            description: 'Standard adjuvant endocrine therapy for a duration of at least 5 years.'
          })
        ])
      );
    }
  });

  it('fills in protocol with interventions and arm references', () => {
    expect(updatedTrial.protocol).toBeDefined();
    if (updatedTrial.protocol) {
      expect(updatedTrial.protocol).toHaveSize(3);
      const references: PlanDefinition[] = [];
      for (const plan of updatedTrial.protocol) {
        if (plan.reference && plan.reference.length > 1) {
          const intervention: PlanDefinition = getContainedResource(
            updatedTrial,
            plan.reference.substring(1)
          ) as PlanDefinition;
          if (intervention) references.push(intervention);
        } else {
          fail('PlanDefinition not defined for intervention');
        }
      }

      try {
        const titles = references.map((item) => item.title);
        const types = references.map((item) => (item.type ? item.type.text : null));
        const subjects = references.map((item) =>
          item.subjectCodeableConcept ? item.subjectCodeableConcept.text : null
        );

        expect(titles).toEqual(
          jasmine.arrayContaining([
            'Palbociclib',
            'Standard Adjuvant Endocrine Therapy',
            'Standard Adjuvant Endocrine Therapy'
          ])
        );
        expect(types).toEqual(jasmine.arrayContaining(['Drug', 'Drug', 'Drug']));
        expect(subjects).toEqual(jasmine.arrayContaining(['Arm A', 'Arm A', 'Arm B']));
      } catch (err) {
        fail(err);
      }
    }
  });

  it('fills in interventions even without arms', () => {
    const result = createResearchStudyFromClinicalStudy({
      protocolSection: {
        armsInterventionsModule: {
          interventions: [
            {
              type: InterventionType.BEHAVIORAL,
              name: 'Name',
              description: 'Description',
              otherNames: ['Other name']
            }
          ]
        }
      }
    });

    expect(result.protocol).toBeDefined();
    expect(result.protocol).toHaveSize(1);

    if (result.protocol && result.protocol.length > 0) {
      if (result.protocol[0].reference && result.protocol[0].reference.length > 1) {
        const intervention: PlanDefinition = getContainedResource(
          result,
          result.protocol[0].reference.substring(1)
        ) as PlanDefinition;
        expect(intervention).toEqual(
          jasmine.objectContaining({
            resourceType: 'PlanDefinition',
            status: 'unknown',
            description: 'Description',
            title: 'Name',
            subtitle: 'Other name',
            type: { text: 'Behavioral' }
          })
        );
      }
    }
  });

  it('fills in interventions with description and subtitle', () => {
    const result = createResearchStudyFromClinicalStudy({
      protocolSection: {
        armsInterventionsModule: {
          interventions: [
            {
              type: InterventionType.BEHAVIORAL,
              name: 'Name',
              description: 'Description',
              otherNames: ['Other name'],
              armGroupLabels: ['Arm']
            }
          ]
        }
      }
    });

    expect(result.protocol).toBeDefined();
    expect(result.protocol).toHaveSize(1);

    if (result.protocol && result.protocol.length > 0) {
      if (result.protocol[0].reference && result.protocol[0].reference.length > 1) {
        const intervention: PlanDefinition = getContainedResource(
          result,
          result.protocol[0].reference.substring(1)
        ) as PlanDefinition;
        expect(intervention).toEqual(
          jasmine.objectContaining({
            resourceType: 'PlanDefinition',
            status: 'unknown',
            description: 'Description',
            title: 'Name',
            subtitle: 'Other name',
            type: { text: 'Behavioral' },
            subjectCodeableConcept: { text: 'Arm' }
          })
        );
      }
    }
  });

  it('falls back on the intervention model description if no intervention model is given', () => {
    const result = createResearchStudyFromClinicalStudy({
      protocolSection: {
        designModule: {
          designInfo: {
            interventionModelDescription: 'Test intervention'
          }
        }
      }
    });
    expect(result.category).toEqual([{ text: 'Intervention Model: Test intervention' }]);
  });

  it('fills in period', () => {
    const result = createResearchStudyFromClinicalStudy({
      protocolSection: {
        statusModule: {
          startDateStruct: {
            date: '2023-01',
            type: DateType.ACTUAL
          },
          completionDateStruct: {
            date: '2023-02',
            type: DateType.ACTUAL
          }
        }
      }
    });

    expect(result.period).toBeDefined();
    if (result.period) {
      expect(result.period.start).toBeDefined();
      expect(result.period.end).toBeDefined();

      expect(result.period.start).toEqual('2023-01');
      expect(result.period.end).toEqual('2023-02');
    }
  });

  it('fills in start of period even without end', () => {
    const result = createResearchStudyFromClinicalStudy({
      protocolSection: {
        statusModule: {
          startDateStruct: {
            date: '2023-01',
            type: DateType.ACTUAL
          }
        }
      }
    });

    expect(result.period).toBeDefined();
    if (result.period) {
      expect(result.period.start).toBeDefined();
      expect(result.period.end).not.toBeDefined();

      expect(result.period.start).toEqual('2023-01');
    }
  });

  it('fills in end of period even without start', () => {
    const result = createResearchStudyFromClinicalStudy({
      protocolSection: {
        statusModule: {
          completionDateStruct: {
            date: '2023-02',
            type: DateType.ACTUAL
          }
        }
      }
    });

    expect(result.period).toBeDefined();
    if (result.period) {
      expect(result.period.start).not.toBeDefined();
      expect(result.period.end).toBeDefined();

      expect(result.period.end).toEqual('2023-02');
    }
  });

  it('does not fill in period if not a real date', () => {
    const result = createResearchStudyFromClinicalStudy({
      protocolSection: {
        statusModule: {
          startDateStruct: {
            date: 'Not real',
            type: DateType.ACTUAL
          },
          completionDateStruct: {
            date: 'Not real',
            type: DateType.ACTUAL
          }
        }
      }
    });

    expect(result.period).not.toBeDefined();
  });

  it('fills in description', () => {
    expect(updatedTrial.description).toBeDefined();
  });

  it('fills out the status', () => {
    const actual = createResearchStudyFromClinicalStudy(
      {
        protocolSection: {
          statusModule: {
            lastKnownStatus: Status.AVAILABLE
          }
        }
      }
    );
    expect(actual.status).toEqual('completed');
  });

  it('defaults to active if status is unavailable', () => {
    const actual = createResearchStudyFromClinicalStudy(
      {
        // Lie about types
        protocolSection: {
          statusModule: {
            lastKnownStatus: 'something invalid' as unknown as Status
          }
        }
      }
    );
    // It shouldn't have changed it, because it can't
    expect(actual.status).toEqual('active');
  });

  it('fills out conditions', () => {
    const actual = createResearchStudyFromClinicalStudy(
      {
        protocolSection: {
          conditionsModule: {
            conditions: ['Condition 1', 'Condition 2']
          }
        }
      }
    );
    expect(actual.condition).toBeDefined();
    if (actual.condition) {
      expect(actual.condition.length).toEqual(2);
      expect(actual.condition[0].text).toEqual('Condition 1');
      expect(actual.condition[1].text).toEqual('Condition 2');
    }
  });

  it('fills in contact', () => {
    const result = createResearchStudyFromClinicalStudy({
      protocolSection: {
        contactsLocationsModule: {
          centralContacts: [
            {
              name: 'First Middle Last, MD',
              phone: '1112223333',
              email: 'email@example.com'
            },
            {
              name: 'First2 Middle2 Last2, DO',
              phone: '1234567890',
              email: 'email2@example.com'
            }
          ]
        }
      }
    });

    expect(result.contact).toBeDefined();
    if (result.contact) {
      expect(result.contact).toHaveSize(2);
      expect(result.contact).toEqual(
        jasmine.arrayContaining([
          jasmine.objectContaining({
            name: 'First Middle Last, MD',
            telecom: [
              { system: 'email', value: 'email@example.com', use: 'work' },
              { system: 'phone', value: '1112223333', use: 'work' }
            ]
          }),
          jasmine.objectContaining({
            name: 'First2 Middle2 Last2, DO',
            telecom: [
              { system: 'email', value: 'email2@example.com', use: 'work' },
              { system: 'phone', value: '1234567890', use: 'work' }
            ]
          })
        ])
      );
    }
  });

  it('fills in contacts even with missing information', () => {
    const result = createResearchStudyFromClinicalStudy({
      protocolSection: {
        contactsLocationsModule: {
          centralContacts: [
            {
              name: 'First Last',
              email: 'email@example.com'
            },
            {
              name: 'Middle2',
              phone: '1234567890'
            }
          ]
        }
      }
    });

    expect(result.contact).toBeDefined();
    if (result.contact) {
      expect(result.contact).toHaveSize(2);
      expect(result.contact).toEqual(
        jasmine.arrayContaining([
          jasmine.objectContaining({
            name: 'First Last',
            telecom: [{ system: 'email', value: 'email@example.com', use: 'work' }]
          }),
          jasmine.objectContaining({
            name: 'Middle2',
            telecom: [{ system: 'phone', value: '1234567890', use: 'work' }]
          })
        ])
      );
    }
  });

  it('overwrites site data', () => {
    const researchStudy = new ResearchStudyObj('id');
    researchStudy.addSite('Example');
    const result = createResearchStudyFromClinicalStudy({
      protocolSection: {
        contactsLocationsModule: {
          locations: [
            {
              facility: 'Facility'
            }
          ]
        }
      }
    });
    expect(result.site).toBeDefined();
    // FIXME: Verify that the sites are from thte test data
  });

  it('replaces the data in a filled out study', () => {
    // Clone the trial in the dumbest but also most sensible way
    const exampleStudy: ResearchStudy = JSON.parse(JSON.stringify(trialFilled));
    createResearchStudyFromClinicalStudy(sampleStudy as Study, exampleStudy);
    // TODO: Figure out the data that should have changed
  });

  function expectTelecom(location: Location, type: 'phone' | 'email', expectedValue: string | null) {
    // Look through the telecoms
    // If the expected value is null, telecom must be defined, otherwise it
    // may be empty
    if (expectedValue !== null) expect(location.telecom).toBeDefined();
    if (location.telecom) {
      // If we're expecting a telecom we're expecting it to appear exactly once
      let found = 0;
      for (const telecom of location.telecom) {
        if (telecom.system === type) {
          found++;
          if (found > 1) {
            fail(`Found an extra ${type}`);
          }
          if (expectedValue === null) {
            // If null, it wasn't expected at all
            fail(`Expected no ${type}, but one was found`);
          } else {
            expect(telecom.use).toEqual('work');
            expect(telecom.value).toEqual(expectedValue);
          }
        }
      }
      if (expectedValue !== null && found === 0) {
        fail(`Expected one ${type}, not found`);
      }
    }
  }

  function expectLocation(
    resource: FhirResource,
    expectedName?: string,
    expectedPhone?: string,
    expectedEmail?: string,
    expectedAddress?: Address,
    expectedStatus?: Location['status']
  ) {
    if (resource.resourceType === 'Location') {
      const location = resource as Location;
      if (expectedName) {
        expect(location.name).toEqual(expectedName);
      } else {
        expect(location.name).not.toBeDefined();
      }
      expectTelecom(location, 'phone', expectedPhone || null);
      expectTelecom(location, 'email', expectedEmail || null);
      if (expectedAddress) {
        expect(location.address).toBeDefined();
        expect(location.address).toEqual(expectedAddress);
      } else {
        expect(location.address).not.toBeDefined();
      }
      if (expectedStatus) {
        expect(location.status).toEqual(expectedStatus);
      }
    } else {
      fail(`Expected Location, got ${resource.resourceType}`);
    }
  }

  it('fills out sites as expected', () => {
    const result = createResearchStudyFromClinicalStudy(
      {
        protocolSection: {
          contactsLocationsModule: {
            locations: [
              // Everything in location is optional, so this is valid:
              {},
              {
                facility: 'No Details'
              },
              {
                facility: 'Only Email',
                contacts: [
                  {
                    email: 'email@example.com'
                  }
                ]
              },
              {
                facility: 'Only Phone',
                contacts: [
                  {
                    phone: '781-555-0100'
                  }
                ]
              },
              {
                facility: 'Phone and Email',
                contacts: [
                  {
                    email: 'hasemail@example.com',
                    phone: '781-555-0101'
                  }
                ]
              },
              {
                facility: 'Only Address',
                status: RecruitmentStatus.RECRUITING,
                city: 'Bedford',
                state: 'MA',
                country: 'US',
                zip: '01730'
              }
            ]
          }
        }
      }
    );
    // Sites should be filled out
    expect(result.site).toBeDefined();
    if (result.site) {
      expect(result.site.length).toEqual(6);
    }
    // Make sure each individual site was created properly - they will be contained resources and should be in order
    expect(result.contained).toBeDefined();
    if (result.contained) {
      expectLocation(result.contained[0]);
      expectLocation(result.contained[1], 'No Details');
      expectLocation(result.contained[2], 'Only Email', undefined, 'email@example.com');
      expectLocation(result.contained[3], 'Only Phone', '781-555-0100');
      expectLocation(result.contained[4], 'Phone and Email', '781-555-0101', 'hasemail@example.com');
      expectLocation(
        result.contained[5],
        'Only Address',
        undefined,
        undefined,
        {
          use: 'work',
          city: 'Bedford',
          state: 'MA',
          postalCode: '01730',
          country: 'US'
        },
        'active'
      );
    }
  });

  function expectEmptyResearchStudy(researchStudy: ResearchStudy): void {
    // Technically this is just checking fields createResearchStudyFromClinicalStudy may change
    expect(researchStudy.contained).withContext('contained').not.toBeDefined();
    expect(researchStudy.enrollment).withContext('enrollment').not.toBeDefined();
    expect(researchStudy.description).withContext('description').not.toBeDefined();
    expect(researchStudy.phase).withContext('phase').not.toBeDefined();
    expect(researchStudy.category).withContext('category').not.toBeDefined();
    expect(researchStudy.status).toEqual('active');
    expect(researchStudy.condition).withContext('condition').not.toBeDefined();
    expect(researchStudy.site).withContext('site').not.toBeDefined();
  }

  it("handles JSON with missing data (doesn't crash)", () => {
    let researchStudy: ResearchStudy;
    // According to the schema, literally everything is optional, so an empty object should "work"
    researchStudy = createResearchStudyFromClinicalStudy({});
    // Expect nothing to have changed
    expectEmptyResearchStudy(researchStudy);
    // Some partial JSON
    researchStudy = createResearchStudyFromClinicalStudy({
      protocolSection: {
        eligibilityModule: {
          genderBased: false,
          minimumAge: '18 years',
          maximumAge: 'N/A'
        }
      }
    });
    expectEmptyResearchStudy(researchStudy);
    // Some bad JSON that shouldn't cause issues
    researchStudy = createResearchStudyFromClinicalStudy({
      protocolSection: {
        contactsLocationsModule: {
          locations: [undefined as unknown as StudyLocation]
        }
      }
    });
    expectEmptyResearchStudy(researchStudy);
  });
});
