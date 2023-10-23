import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Bundle } from 'fhir/r4';
import { mCODEextractor } from '../src/mcodeextractor';

// This used to "test" the abstract MappingLogic class. However, as that class essentially did nothing, this is kept
// because what this test really does is test to ensure that the mCODEextractor pulls out what it's supposed to.
describe('mCODEExtractor results', () => {
  let extractedMcode: mCODEextractor;
  beforeAll(async () => {
    const patientDataPath = path.join(__dirname, '../../spec/data/patient_data.json');
    const sampleData = JSON.parse(await fs.readFile(patientDataPath, { encoding: 'utf8' })) as Bundle;
    extractedMcode = new mCODEextractor(sampleData);
  });

  it('Test Primary Cancer Value', function () {
    expect(extractedMcode.primaryCancerConditions).toEqual([
      {
        clinicalStatus: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
        meta_profile: 'mcode-primary-cancer-condition',
        histologyMorphologyBehavior: [
          { system: 'http://snomed.info/sct', code: '367651003', display: 'Malignant Neoplasm (Morphology)' }
        ],
        coding: [
          { system: 'http://snomed.info/sct', code: '254837009', display: 'Malignant neoplasm of breast (disorder)' }
        ],
        id: '4dee068c-5ffe-4977-8677-4ff9b518e763'
      }
    ]);
  });
  it('Test Secondary Cancer Values', function () {
    expect(extractedMcode.secondaryCancerConditions).toEqual([
      {
        clinicalStatus: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
        meta_profile: 'mcode-secondary-cancer-condition',
        id: '4dee068c-5ffe-4977-8677-4ff9b518e763x',
        bodySite: [{ system: 'http://snomed.info/sct', code: '8935007' }],
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '128462008',
            display: 'Secondary malignant neoplastic disease (disorder)'
          }
        ]
      },
      {
        clinicalStatus: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
        meta_profile: 'mcode-secondary-cancer-condition',
        id: '4dee068c-5ffe-4977-8677-4ff9b518e763x',
        bodySite: [{ system: 'http://snomed.info/sct', code: '8935007' }],
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '128462008',
            display: 'Secondary malignant neoplastic disease (disorder)'
          }
        ]
      }
    ]);
  });
  it('extracts cancer genetic variants', function () {
    expect(extractedMcode.cancerGeneticVariants).toEqual([
      {
        coding: [{ system: 'http://loinc.org', code: '69548-6' }],
        component: {
          geneStudied: [
            {
              code: { coding: [{ system: 'http://loinc.org', code: '48018-6' }] },
              valueCodeableConcept: { coding: [{ system: 'http://www.genenames.org/geneId', code: 'HGNC:11389' }] },
              interpretation: [
                {
                  coding: [{ system: 'http://hl7.org/fhir/ValueSet/observation-interpretation', code: 'CAR' }]
                }
              ]
            }
          ],
          genomicsSourceClass: [
            {
              code: { coding: [{ system: 'http://loinc.org', code: '48002-0' }] },
              valueCodeableConcept: { coding: [{ system: 'http://loinc.org', code: 'LA6684-0' }] },
              interpretation: [
                {
                  coding: [{ system: 'http://hl7.org/fhir/ValueSet/observation-interpretation', code: 'A' }]
                }
              ]
            }
          ]
        },
        valueCodeableConcept: [{ system: 'http://loinc.org', code: 'LA9633-4' }],
        interpretation: [{ system: 'http://hl7.org/fhir/ValueSet/observation-interpretation', code: 'POS' }]
      },
      {
        coding: [{ system: 'http://loinc.org', code: '69548-6' }],
        component: {
          geneStudied: [
            {
              code: { coding: [{ system: 'http://loinc.org', code: '48018-6' }] },
              valueCodeableConcept: { coding: [{ system: 'http://www.genenames.org/geneId', code: 'HGNC:11389' }] },
              interpretation: [
                {
                  coding: [{ system: 'http://hl7.org/fhir/ValueSet/observation-interpretation', code: 'CAR' }]
                }
              ]
            }
          ],
          genomicsSourceClass: [
            {
              code: { coding: [{ system: 'http://loinc.org', code: '48002-0' }] },
              valueCodeableConcept: { coding: [{ system: 'http://loinc.org', code: 'LA6684-0' }] },
              interpretation: [
                {
                  coding: [{ system: 'http://hl7.org/fhir/ValueSet/observation-interpretation', code: 'A' }]
                }
              ]
            }
          ]
        },
        valueCodeableConcept: [{ system: 'http://loinc.org', code: 'LA9633-4' }],
        interpretation: [{ system: 'http://hl7.org/fhir/ValueSet/observation-interpretation', code: 'POS' }]
      }
    ]);
  });
  it('Test Radiation Procedure Values', function () {
    expect(extractedMcode.cancerRelatedRadiationProcedures).toEqual([
      {
        bodySite: [],
        mcodeTreatmentIntent: [],
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '448385000',
            display: 'Megavoltage radiation therapy using photons (procedure)'
          }
        ]
      },
      {
        bodySite: [{ system: 'http://snomed.info/sct', code: '12738006' }],
        mcodeTreatmentIntent: [],
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '448385000',
            display: 'Megavoltage radiation therapy using photons (procedure)'
          }
        ]
      }
    ]);
  });
  it('extracts cancer related surgical procedures', function () {
    expect(extractedMcode.cancerRelatedSurgicalProcedures).toEqual([
      {
        bodySite: [],
        reasonReference: [
          {
            reference: '4dee068c-5ffe-4977-8677-4ff9b518e763',
            display: 'Malignant neoplasm of breast (disorder)',
            meta_profile: 'mcode-primary-cancer-condition'
          }
        ],
        coding: [
          { system: 'http://snomed.info/sct', code: '396487001', display: 'Sentinel lymph node biopsy (procedure)' }
        ]
      },
      {
        bodySite: [],
        reasonReference: [
          {
            reference: '4dee068c-5ffe-4977-8677-4ff9b518e763',
            display: 'Malignant neoplasm of breast (disorder)',
            meta_profile: 'mcode-primary-cancer-condition'
          }
        ],
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '443497002',
            display: 'Excision of sentinel lymph node (procedure)'
          }
        ]
      },
      {
        bodySite: [{ system: 'http://snomed.info/sct', code: '12738006' }],
        reasonReference: [
          {
            reference: '4dee068c-5ffe-4977-8677-4ff9b518e763x',
            display: 'Secondary Cancer Condition Reference - for tests.',
            meta_profile: 'mcode-secondary-cancer-condition'
          }
        ],
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '396487001',
            display: 'Sentinel lymph node biopsy (procedure) (DUPLICATE FOR TESTS)'
          }
        ]
      }
    ]);
  });
  it("extracts the patient's age", function () {
    expect(extractedMcode.birthDate).toEqual('1966-08-03');
  });
  it('Test Stage Value', function () {
    expect(extractedMcode.primaryCancerConditions).toEqual([
      {
        clinicalStatus: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
        meta_profile: 'mcode-primary-cancer-condition',
        histologyMorphologyBehavior: [
          { system: 'http://snomed.info/sct', code: '367651003', display: 'Malignant Neoplasm (Morphology)' }
        ],
        coding: [
          { system: 'http://snomed.info/sct', code: '254837009', display: 'Malignant neoplasm of breast (disorder)' }
        ],
        id: '4dee068c-5ffe-4977-8677-4ff9b518e763'
      }
    ]);
  });
  it('Test Tumor Marker Values', () => {
    expect(extractedMcode.TNMClinicalStageGroups).toEqual([
      { system: 'http://snomed.info/sct', code: '261638004', display: 'Stage 3A (qualifier value)' },
      { system: 'http://cancerstaging.org', code: 'c3A' }
    ]);
    expect(extractedMcode.TNMPathologicalStageGroups).toEqual([
      { system: 'http://snomed.info/sct', code: '261638004', display: 'Stage 3A (qualifier value)' },
      { system: 'http://cancerstaging.org', code: 'c3A' }
    ]);
    expect(extractedMcode.tumorMarkers).toEqual([
      {
        valueQuantity: { value: 3 },
        valueRatio: undefined,
        valueCodeableConcept: [
          { system: 'http://snomed.info/sct', code: '10828004', display: 'Positive (qualifier value)' }
        ],
        interpretation: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
            code: 'POS',
            display: 'Positive'
          }
        ],
        coding: [
          { system: 'http://loinc.org', code: '48676-1', display: 'HER2 [Interpretation] in Tissue' },
          {
            system: 'http://loinc.org',
            code: '85319-2',
            display: 'HER2 [Presence] in Breast cancer specimen by Immune stain'
          }
        ]
      },
      {
        valueQuantity: undefined,
        valueRatio: { numerator: { value: 1, comparator: '>=' }, denominator: { value: 100, comparator: '>=' } },
        valueCodeableConcept: [
          { system: 'http://snomed.info/sct', display: 'Positive (qualifier value)', code: '10828004' }
        ],
        interpretation: [],
        coding: [
          { system: 'http://loinc.org', code: '48676-1', display: 'HER2 [Interpretation] in Tissue' },
          {
            system: 'http://loinc.org',
            code: '85318-4',
            display: 'HER2 [Presence] in Breast cancer specimen by FISH'
          }
        ]
      },
      {
        valueQuantity: { value: 10, comparator: '>=', unit: '%', system: 'http://unitsofmeasure.org' },
        valueRatio: undefined,
        valueCodeableConcept: [
          { system: 'http://snomed.info/sct', code: '10828004', display: 'Positive (qualifier value)' }
        ],
        interpretation: [],
        coding: [
          { system: 'http://loinc.org', code: '16112-5', display: 'Estrogen receptor [Interpretation] in Tissue' },
          {
            system: 'http://loinc.org',
            code: '85337-4',
            display: 'Estrogen receptor Ag [Presence] in Breast cancer specimen by Immune stain'
          }
        ]
      }
    ]);
  });
  it('Test Medication Statement Values', function () {
    expect(extractedMcode.cancerRelatedMedicationStatements).toEqual([
      { system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '583214', display: 'Paclitaxel 100 MG Injection' }
    ]);
  });
  it('Test Ecog Score Values', function () {
    expect(extractedMcode.ecogPerformanceStatus).toEqual(3);
  });
  it('Test Karnofsky Score Values', function () {
    expect(extractedMcode.karnofskyPerformanceStatus).toEqual(90);
  });
});
