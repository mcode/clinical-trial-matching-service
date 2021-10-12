import fs from 'fs';
import path from 'path';
import { Bundle } from '../src/fhir-types';
import { MappingLogic } from '../src/mappinglogic';

describe('Abstract Code Mapper getter tests', () => {
  let mappingLogic: MappingLogic;
  let sampleData: Bundle;
  beforeAll(() => {
    return new Promise((resolve, reject) => {
      const patientDataPath = path.join(__dirname, '../../spec/data/patient_data.json');
      fs.readFile(patientDataPath, { encoding: 'utf8' }, (error, data) => {
        if (error) {
          console.error('Could not read spec file');
          reject(error);
          return;
        }
        try {
          sampleData = JSON.parse(data) as Bundle;
          mappingLogic = new DummyMappingLogic(sampleData);
          // The object we resolve to doesn't really matter
          resolve(sampleData);
        } catch (ex) {
          reject(error);
        }
      });
    });
  });

  it('Test Primary Cancer Value', function () {
    expect(mappingLogic.getPrimaryCancerValues()).toBe('[{"clinicalStatus":[{"system":"http://terminology.hl7.org/CodeSystem/condition-clinical","code":"active"}],"meta_profile":"mcode-primary-cancer-condition","histologyMorphologyBehavior":[{"system":"http://snomed.info/sct","code":"367651003","display":"Malignant Neoplasm (Morphology)"}],"coding":[{"system":"http://snomed.info/sct","code":"254837009","display":"Malignant neoplasm of breast (disorder)"}],"id":"4dee068c-5ffe-4977-8677-4ff9b518e763"}]');
  });
  it('Test Secondary Cancer Values', function () {
    expect(JSON.stringify(mappingLogic.getSecondaryCancerValues())).toBe('["[{\\"clinicalStatus\\":[{\\"system\\":\\"http://terminology.hl7.org/CodeSystem/condition-clinical\\",\\"code\\":\\"active\\"}],\\"meta_profile\\":\\"mcode-secondary-cancer-condition\\",\\"id\\":\\"4dee068c-5ffe-4977-8677-4ff9b518e763x\\",\\"bodySite\\":[{\\"system\\":\\"http://snomed.info/sct\\",\\"code\\":\\"8935007\\"}],\\"coding\\":[{\\"system\\":\\"http://snomed.info/sct\\",\\"code\\":\\"128462008\\",\\"display\\":\\"Secondary malignant neoplastic disease (disorder)\\"}]},{\\"clinicalStatus\\":[{\\"system\\":\\"http://terminology.hl7.org/CodeSystem/condition-clinical\\",\\"code\\":\\"active\\"}],\\"meta_profile\\":\\"mcode-secondary-cancer-condition\\",\\"id\\":\\"4dee068c-5ffe-4977-8677-4ff9b518e763x\\",\\"bodySite\\":[{\\"system\\":\\"http://snomed.info/sct\\",\\"code\\":\\"8935007\\"}],\\"coding\\":[{\\"system\\":\\"http://snomed.info/sct\\",\\"code\\":\\"128462008\\",\\"display\\":\\"Secondary malignant neoplastic disease (disorder)\\"}]}]"]');
  });
  it('Test Histology Morhpology Value', function () {
    expect(mappingLogic.getHistologyMorphologyValue()).toBe('[{"clinicalStatus":[{"system":"http://terminology.hl7.org/CodeSystem/condition-clinical","code":"active"}],"meta_profile":"mcode-primary-cancer-condition","histologyMorphologyBehavior":[{"system":"http://snomed.info/sct","code":"367651003","display":"Malignant Neoplasm (Morphology)"}],"coding":[{"system":"http://snomed.info/sct","code":"254837009","display":"Malignant neoplasm of breast (disorder)"}],"id":"4dee068c-5ffe-4977-8677-4ff9b518e763"}]');
  });
  it('Test Radiation Procedure Values', function () {
    expect(JSON.stringify(mappingLogic.getRadiationProcedureValues())).toBe('["[{\\"bodySite\\":[],\\"mcodeTreatmentIntent\\":[],\\"coding\\":[{\\"system\\":\\"http://snomed.info/sct\\",\\"code\\":\\"448385000\\",\\"display\\":\\"Megavoltage radiation therapy using photons (procedure)\\"}]},{\\"bodySite\\":[{\\"system\\":\\"http://snomed.info/sct\\",\\"code\\":\\"12738006\\"}],\\"mcodeTreatmentIntent\\":[],\\"coding\\":[{\\"system\\":\\"http://snomed.info/sct\\",\\"code\\":\\"448385000\\",\\"display\\":\\"Megavoltage radiation therapy using photons (procedure)\\"}]}]"]');
  });
  it('Test Surgical Procedure Values', function () {
    expect(JSON.stringify(mappingLogic.getSurgicalProcedureValues())).toBe('["[{\\"bodySite\\":[],\\"reasonReference\\":{\\"reference\\":\\"4dee068c-5ffe-4977-8677-4ff9b518e763\\",\\"display\\":\\"Malignant neoplasm of breast (disorder)\\",\\"meta_profile\\":\\"mcode-primary-cancer-condition\\"},\\"coding\\":[{\\"system\\":\\"http://snomed.info/sct\\",\\"code\\":\\"396487001\\",\\"display\\":\\"Sentinel lymph node biopsy (procedure)\\"}]},{\\"bodySite\\":[],\\"reasonReference\\":{\\"reference\\":\\"4dee068c-5ffe-4977-8677-4ff9b518e763\\",\\"display\\":\\"Malignant neoplasm of breast (disorder)\\",\\"meta_profile\\":\\"mcode-primary-cancer-condition\\"},\\"coding\\":[{\\"system\\":\\"http://snomed.info/sct\\",\\"code\\":\\"443497002\\",\\"display\\":\\"Excision of sentinel lymph node (procedure)\\"}]},{\\"bodySite\\":[{\\"system\\":\\"http://snomed.info/sct\\",\\"code\\":\\"12738006\\"}],\\"reasonReference\\":{\\"reference\\":\\"4dee068c-5ffe-4977-8677-4ff9b518e763x\\",\\"display\\":\\"Secondary Cancer Condition Reference - for tests.\\",\\"meta_profile\\":\\"mcode-secondary-cancer-condition\\"},\\"coding\\":[{\\"system\\":\\"http://snomed.info/sct\\",\\"code\\":\\"396487001\\",\\"display\\":\\"Sentinel lymph node biopsy (procedure) (DUPLICATE FOR TESTS)\\"}]}]"]');
  });
  it('Test Age Value', function () {
    expect(mappingLogic.getAgeValue()).toBe(1966);
  });
  it('Test Stage Value', function () {
    expect(mappingLogic.getStageValues()).toBe('[{"clinicalStatus":[{"system":"http://terminology.hl7.org/CodeSystem/condition-clinical","code":"active"}],"meta_profile":"mcode-primary-cancer-condition","histologyMorphologyBehavior":[{"system":"http://snomed.info/sct","code":"367651003","display":"Malignant Neoplasm (Morphology)"}],"coding":[{"system":"http://snomed.info/sct","code":"254837009","display":"Malignant neoplasm of breast (disorder)"}],"id":"4dee068c-5ffe-4977-8677-4ff9b518e763"}]');
  });
  it('Test Tumor Marker Values', function () {
    expect(JSON.stringify(mappingLogic.getTumorMarkerValues())).toBe('["[{\\"system\\":\\"http://snomed.info/sct\\",\\"code\\":\\"261638004\\",\\"display\\":\\"Stage 3A (qualifier value)\\"},{\\"system\\":\\"http://cancerstaging.org\\",\\"code\\":\\"c3A\\"}]"]');
  });
  it('Test Medication Statement Values', function () {
    expect(JSON.stringify(mappingLogic.getMedicationStatementValues())).toBe('["[{\\"system\\":\\"http://www.nlm.nih.gov/research/umls/rxnorm\\",\\"code\\":\\"583214\\",\\"display\\":\\"Paclitaxel 100 MG Injection\\"}]"]');
  });
});

/**
 * Dummy mapping logic class for testing abstract implementation.
 */
class DummyMappingLogic extends MappingLogic {
  getPrimaryCancerValues(): string {
    return JSON.stringify(this.getExtractedPrimaryCancerConditions());
  }
  getSecondaryCancerValues(): string[] {
    return [JSON.stringify(this.getExtractedSecondaryCancerConditions())];
  }
  getHistologyMorphologyValue(): string {
    return JSON.stringify(this.getExtractedPrimaryCancerConditions());
  }
  getRadiationProcedureValues(): string[] {
    return [JSON.stringify(this.getExtractedCancerRelatedRadiationProcedures())];
  }
  getSurgicalProcedureValues(): string[] {
    return [JSON.stringify(this.getExtractedCancerRelatedSurgicalProcedures())];
  }
  getAgeValue(): number {
    return parseInt(this.getExtractedBirthDate());
  }
  getStageValues(): string {
    return JSON.stringify(this.getExtractedPrimaryCancerConditions());
  }
  getTumorMarkerValues(): string[] {
    return [JSON.stringify(this.getExtractedTNMclinicalStageGroup())];
  }
  getMedicationStatementValues(): string[] {
    return [JSON.stringify(this.getExtractedCancerRelatedMedicationStatements())];
  }
  getECOGScore(): number {
    // return this.getExtractedEcogPerformaceStatus();
    return 0;
  }
  getKarnofskyScore(): number {
    // return this.getExtractedKarnofskyPerformanceStatus();
    return 0;
  }
}
