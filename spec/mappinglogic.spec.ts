import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Bundle } from 'fhir/r4';
import { MappingLogic } from '../src/mappinglogic';

describe('Abstract Code Mapper getter tests', () => {
  let mappingLogic: MappingLogic;
  beforeAll(async () => {
    const patientDataPath = path.join(__dirname, '../../spec/data/patient_data.json');
    const sampleData = JSON.parse(await fs.readFile(patientDataPath, { encoding: 'utf8' })) as Bundle;
    mappingLogic = new DummyMappingLogic(sampleData);
  });

  it('Test Primary Cancer Value', function () {
    expect(mappingLogic.getPrimaryCancerValues()).toBe('[{"clinicalStatus":[{"system":"http://terminology.hl7.org/CodeSystem/condition-clinical","code":"active"}],"meta_profile":"mcode-primary-cancer-condition","histologyMorphologyBehavior":[{"system":"http://snomed.info/sct","code":"367651003","display":"Malignant Neoplasm (Morphology)"}],"coding":[{"system":"http://snomed.info/sct","code":"254837009","display":"Malignant neoplasm of breast (disorder)"}],"id":"4dee068c-5ffe-4977-8677-4ff9b518e763"}]');
  });
  it('Test Secondary Cancer Values', function () {
    expect(JSON.stringify(mappingLogic.getSecondaryCancerValues())).toBe('["[{\\"clinicalStatus\\":[{\\"system\\":\\"http://terminology.hl7.org/CodeSystem/condition-clinical\\",\\"code\\":\\"active\\"}],\\"meta_profile\\":\\"mcode-secondary-cancer-condition\\",\\"id\\":\\"4dee068c-5ffe-4977-8677-4ff9b518e763x\\",\\"bodySite\\":[{\\"system\\":\\"http://snomed.info/sct\\",\\"code\\":\\"8935007\\"}],\\"coding\\":[{\\"system\\":\\"http://snomed.info/sct\\",\\"code\\":\\"128462008\\",\\"display\\":\\"Secondary malignant neoplastic disease (disorder)\\"}]},{\\"clinicalStatus\\":[{\\"system\\":\\"http://terminology.hl7.org/CodeSystem/condition-clinical\\",\\"code\\":\\"active\\"}],\\"meta_profile\\":\\"mcode-secondary-cancer-condition\\",\\"id\\":\\"4dee068c-5ffe-4977-8677-4ff9b518e763x\\",\\"bodySite\\":[{\\"system\\":\\"http://snomed.info/sct\\",\\"code\\":\\"8935007\\"}],\\"coding\\":[{\\"system\\":\\"http://snomed.info/sct\\",\\"code\\":\\"128462008\\",\\"display\\":\\"Secondary malignant neoplastic disease (disorder)\\"}]}]"]');
  });
  it('Test Histology Morhpology Value', function () {
    expect(mappingLogic.getHistologyMorphologyValue()).toBe('[{"coding":[{"system":"http://loinc.org","code":"69548-6"}],"component":{"geneStudied":[{"code":{"coding":[{"system":"http://loinc.org","code":"48018-6"}]},"valueCodeableConcept":{"coding":[{"system":"http://www.genenames.org/geneId","code":"HGNC:11389"}]},"interpretation":{"coding":[{"system":"http://hl7.org/fhir/ValueSet/observation-interpretation","code":"CAR"}]}}],"genomicsSourceClass":[{"code":{"coding":[{"system":"http://loinc.org","code":"48002-0"}]},"valueCodeableConcept":{"coding":[{"system":"http://loinc.org","code":"LA6684-0"}]},"interpretation":{"coding":[{"system":"http://hl7.org/fhir/ValueSet/observation-interpretation","code":"A"}]}}]},"valueCodeableConcept":[{"system":"http://loinc.org","code":"LA9633-4"}],"interpretation":[{"system":"http://hl7.org/fhir/ValueSet/observation-interpretation","code":"POS"}]},{"coding":[{"system":"http://loinc.org","code":"69548-6"}],"component":{"geneStudied":[{"code":{"coding":[{"system":"http://loinc.org","code":"48018-6"}]},"valueCodeableConcept":{"coding":[{"system":"http://www.genenames.org/geneId","code":"HGNC:11389"}]},"interpretation":{"coding":[{"system":"http://hl7.org/fhir/ValueSet/observation-interpretation","code":"CAR"}]}}],"genomicsSourceClass":[{"code":{"coding":[{"system":"http://loinc.org","code":"48002-0"}]},"valueCodeableConcept":{"coding":[{"system":"http://loinc.org","code":"LA6684-0"}]},"interpretation":{"coding":[{"system":"http://hl7.org/fhir/ValueSet/observation-interpretation","code":"A"}]}}]},"valueCodeableConcept":[{"system":"http://loinc.org","code":"LA9633-4"}],"interpretation":[{"system":"http://hl7.org/fhir/ValueSet/observation-interpretation","code":"POS"}]}]');
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
    expect(JSON.stringify(mappingLogic.getTumorMarkerValues())).toBe('["[{\\"system\\":\\"http://snomed.info/sct\\",\\"code\\":\\"261638004\\",\\"display\\":\\"Stage 3A (qualifier value)\\"},{\\"system\\":\\"http://cancerstaging.org\\",\\"code\\":\\"c3A\\"}]","[{\\"system\\":\\"http://snomed.info/sct\\",\\"code\\":\\"261638004\\",\\"display\\":\\"Stage 3A (qualifier value)\\"},{\\"system\\":\\"http://cancerstaging.org\\",\\"code\\":\\"c3A\\"}]","[{\\"valueQuantity\\":[{\\"value\\":3}],\\"valueRatio\\":[],\\"valueCodeableConcept\\":[{\\"system\\":\\"http://snomed.info/sct\\",\\"code\\":\\"10828004\\",\\"display\\":\\"Positive (qualifier value)\\"}],\\"interpretation\\":[{\\"system\\":\\"http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation\\",\\"code\\":\\"POS\\",\\"display\\":\\"Positive\\"}],\\"coding\\":[{\\"system\\":\\"http://loinc.org\\",\\"code\\":\\"48676-1\\",\\"display\\":\\"HER2 [Interpretation] in Tissue\\"},{\\"system\\":\\"http://loinc.org\\",\\"code\\":\\"85319-2\\",\\"display\\":\\"HER2 [Presence] in Breast cancer specimen by Immune stain\\"}]},{\\"valueQuantity\\":[],\\"valueRatio\\":[{\\"numerator\\":{\\"value\\":1,\\"comparator\\":\\">=\\"},\\"denominator\\":{\\"value\\":100,\\"comparator\\":\\">=\\"}}],\\"valueCodeableConcept\\":[{\\"system\\":\\"http://snomed.info/sct\\",\\"display\\":\\"Positive (qualifier value)\\",\\"code\\":\\"10828004\\"}],\\"interpretation\\":[],\\"coding\\":[{\\"system\\":\\"http://loinc.org\\",\\"code\\":\\"48676-1\\",\\"display\\":\\"HER2 [Interpretation] in Tissue\\"},{\\"system\\":\\"http://loinc.org\\",\\"code\\":\\"85318-4\\",\\"display\\":\\"HER2 [Presence] in Breast cancer specimen by FISH\\"}]},{\\"valueQuantity\\":[{\\"value\\":10,\\"comparator\\":\\">=\\",\\"unit\\":\\"%\\",\\"system\\":\\"http://unitsofmeasure.org\\"}],\\"valueRatio\\":[],\\"valueCodeableConcept\\":[{\\"system\\":\\"http://snomed.info/sct\\",\\"code\\":\\"10828004\\",\\"display\\":\\"Positive (qualifier value)\\"}],\\"interpretation\\":[],\\"coding\\":[{\\"system\\":\\"http://loinc.org\\",\\"code\\":\\"16112-5\\",\\"display\\":\\"Estrogen receptor [Interpretation] in Tissue\\"},{\\"system\\":\\"http://loinc.org\\",\\"code\\":\\"85337-4\\",\\"display\\":\\"Estrogen receptor Ag [Presence] in Breast cancer specimen by Immune stain\\"}]}]"]');
  });
  it('Test Medication Statement Values', function () {
    expect(JSON.stringify(mappingLogic.getMedicationStatementValues())).toBe('["[{\\"system\\":\\"http://www.nlm.nih.gov/research/umls/rxnorm\\",\\"code\\":\\"583214\\",\\"display\\":\\"Paclitaxel 100 MG Injection\\"}]"]');
  });
  it('Test Ecog Score Values', function () {
    expect(mappingLogic.getECOGScore()).toBe(3);
  });
  it('Test Karnofsky Score Values', function () {
    expect(mappingLogic.getKarnofskyScore()).toBe(90);
  });
});

/**
 * Dummy mapping logic class for testing abstract implementation.
 */
class DummyMappingLogic extends MappingLogic {
  getPrimaryCancerValues(): string {
    return JSON.stringify(this.extractedPrimaryCancerConditions);
  }
  getSecondaryCancerValues(): string[] {
    return [JSON.stringify(this.extractedSecondaryCancerConditions)];
  }
  getHistologyMorphologyValue(): string {
    return JSON.stringify(this.extractedCancerGeneticVariants);
  }
  getRadiationProcedureValues(): string[] {
    return [JSON.stringify(this.extractedCancerRelatedRadiationProcedures)];
  }
  getSurgicalProcedureValues(): string[] {
    return [JSON.stringify(this.extractedCancerRelatedSurgicalProcedures)];
  }
  getAgeValue(): number {
    return this.extractedBirthDate === null ? 0 : parseInt(this.extractedBirthDate);
  }
  getStageValues(): string {
    return JSON.stringify(this.extractedPrimaryCancerConditions);
  }
  getTumorMarkerValues(): string[] {
    return [JSON.stringify(this.extractedTNMClinicalStageGroup), JSON.stringify(this.extractedTNMPathologicalStageGroup), JSON.stringify(this.extractedTumorMarkers)];
  }
  getMedicationStatementValues(): string[] {
    return [JSON.stringify(this.extractedCancerRelatedMedicationStatements)];
  }
  getECOGScore(): number {
    return this.extractedEcogPerformanceStatus;
  }
  getKarnofskyScore(): number {
    return this.extractedKarnofskyPerformanceStatus;
  }
}
