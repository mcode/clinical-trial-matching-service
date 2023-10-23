import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as fhir from 'fhir/r4';
import { CodeMapper, CodeSystemEnum } from '../src/codeMapper';
import * as mcode from '../src/mcodeextractor';
import { MCODE_CANCER_RELATED_SURGICAL_PROCEDURE, MCODE_PRIMARY_CANCER_CONDITION } from '../src/mcode';

async function loadSampleBundle(bundlePath: string): Promise<fhir.Bundle> {
  return JSON.parse(await fs.readFile(path.join(__dirname, bundlePath), { encoding: 'utf8' })) as fhir.Bundle;
}

describe('ExtractedMCODE Import', () => {
  let sampleData: fhir.Bundle;
  beforeAll(async () => {
    sampleData = await loadSampleBundle('../../spec/data/patient_data.json');
  });

  it('checksCountOfExtractedProfiles', function () {
    const extractedData = new mcode.mCODEextractor(sampleData);
    expect(extractedData.primaryCancerConditions.length).toBe(1);
    expect(extractedData.TNMClinicalStageGroups.length).toBe(2);
    expect(extractedData.TNMPathologicalStageGroups.length).toBe(2);
    expect(extractedData.secondaryCancerConditions.length).toBe(2);
    expect(extractedData.birthDate).toBe('1966-08-03');
    expect(extractedData.tumorMarkers.length).toBe(3);
    expect(extractedData.cancerRelatedRadiationProcedures.length).toBe(2);
    expect(extractedData.cancerRelatedSurgicalProcedures.length).toBe(3);
    expect(extractedData.cancerRelatedMedicationStatements.length).toBe(1);
    expect(extractedData.cancerGeneticVariants.length).toBe(2);
    expect(extractedData.ecogPerformanceStatus).toBe(3);
    expect(extractedData.karnofskyPerformanceStatus).toBe(90);
  });

  it('checkExtractedPrimaryCancerCondition', function () {
    const extractedData = new mcode.mCODEextractor(sampleData);
    expect(extractedData.primaryCancerConditions[0].clinicalStatus[0].code).toBe('active');
    expect(extractedData.primaryCancerConditions[0].coding[0].code).toBe('254837009');
    expect(extractedData.primaryCancerConditions[0].histologyMorphologyBehavior[0].code).toBe('367651003');
    expect(extractedData.primaryCancerConditions[0].meta_profile).toBe('mcode-primary-cancer-condition');
  });

  it('checkExtractedTNMClinicalStageGroup', function () {
    const extractedData = new mcode.mCODEextractor(sampleData);
    expect(extractedData.TNMClinicalStageGroups[0].code).toBe('261638004');
    expect(extractedData.TNMClinicalStageGroups[1].code).toBe('c3A');
  });

  it('checkExtractedTNMPathologicalStageGroup', function () {
    const extractedData = new mcode.mCODEextractor(sampleData);
    expect(extractedData.TNMPathologicalStageGroups[0].code).toBe('261638004');
    expect(extractedData.TNMPathologicalStageGroups[1].code).toBe('c3A');
  });

  it('checkExtractedSecondaryCancerCondition', function () {
    const extractedData = new mcode.mCODEextractor(sampleData);
    expect(extractedData.secondaryCancerConditions[0].clinicalStatus[0].code).toBe('active');
    expect(extractedData.secondaryCancerConditions[0].coding[0].code).toBe('128462008');
    expect(extractedData.secondaryCancerConditions[0].bodySite[0].code).toBe('8935007');
    expect(extractedData.secondaryCancerConditions[0].meta_profile).toBe('mcode-secondary-cancer-condition');
  });

  it('checkExtractedTumorMarker', function () {
    const extractedData = new mcode.mCODEextractor(sampleData);
    expect(
      extractedData.tumorMarkers.some(
        (marker) =>
          marker.valueCodeableConcept[0].code == '10828004' &&
          marker.valueQuantity[0].value == 3 &&
          marker.valueRatio.length == 0 &&
          marker.coding[0].code == '48676-1' &&
          marker.coding[1].code == '85319-2' &&
          marker.interpretation[0].code == 'POS'
      )
    ).toBeTrue();
    expect(
      extractedData.tumorMarkers.some(
        (marker) =>
          marker.valueCodeableConcept[0].code == '10828004' &&
          marker.valueQuantity.length == 0 &&
          marker.valueRatio[0].numerator?.value == 1 &&
          marker.valueRatio[0].numerator?.comparator == '>=' &&
          marker.valueRatio[0].denominator?.value == 100 &&
          marker.coding[0].code == '48676-1' &&
          marker.coding[1].code == '85318-4' &&
          marker.interpretation.length == 0
      )
    ).toBeTrue();
    expect(
      extractedData.tumorMarkers.some(
        (marker) =>
          marker.valueCodeableConcept[0].code == '10828004' &&
          marker.valueQuantity.length > 0 &&
          marker.valueQuantity[0].value == 10 &&
          marker.valueQuantity[0].comparator == '>=' &&
          marker.valueQuantity[0].unit == '%' &&
          marker.valueRatio.length == 0 &&
          marker.coding[0].code == '16112-5' &&
          marker.coding[1].code == '85337-4' &&
          marker.interpretation.length == 0
      )
    ).toBeTrue();
  });

  it('checkExtractedCancerRelatedRadiationProcedure', function () {
    const extractedData = new mcode.mCODEextractor(sampleData);
    expect(
      extractedData.cancerRelatedRadiationProcedures.some(
        (procedure) => procedure.coding[0].code == '448385000' && procedure.bodySite.length == 0
      )
    ).toBeTrue();
    expect(
      extractedData.cancerRelatedRadiationProcedures.some(
        (procedure) =>
          procedure.coding[0].code == '448385000' &&
          procedure.bodySite.length != 0 &&
          procedure.bodySite[0].code == '12738006'
      )
    ).toBeTrue();
  });

  it('checkExtractedCancerRelatedSurgicalProcedure', function () {
    const extractedData = new mcode.mCODEextractor(sampleData);
    expect(
      extractedData.cancerRelatedSurgicalProcedures.some((procedure) => procedure.coding[0].code == '396487001')
    ).toBeTrue();
    expect(
      extractedData.cancerRelatedSurgicalProcedures.some((procedure) => procedure.coding[0].code == '443497002')
    ).toBeTrue();
    expect(
      extractedData.cancerRelatedSurgicalProcedures.some((procedure) =>
        procedure.reasonReference.some((r) => r.meta_profile == 'mcode-primary-cancer-condition')
      )
    ).toBeTrue();
    expect(
      extractedData.cancerRelatedSurgicalProcedures.some((procedure) =>
        procedure.reasonReference.some((r) => r.meta_profile == 'mcode-secondary-cancer-condition')
      )
    ).toBeTrue();
  });

  it('checkExtractedCancerGeneticVariant', function () {
    const extractedData = new mcode.mCODEextractor(sampleData);
    expect(extractedData.cancerGeneticVariants[0].coding[0].system).toBe('http://loinc.org');
    expect(extractedData.cancerGeneticVariants[0].coding[0].code).toBe('69548-6');
    expect(extractedData.cancerGeneticVariants[0].valueCodeableConcept[0].system).toBe('http://loinc.org');
    expect(extractedData.cancerGeneticVariants[0].valueCodeableConcept[0].code).toBe('LA9633-4');
    expect(extractedData.cancerGeneticVariants[0].interpretation[0].system).toBe(
      'http://hl7.org/fhir/ValueSet/observation-interpretation'
    );
    expect(extractedData.cancerGeneticVariants[0].interpretation[0].code).toBe('POS');
    expect(extractedData.cancerGeneticVariants[0].component.geneStudied[0].code.coding?.[0].system).toBe(
      'http://loinc.org'
    );
    expect(extractedData.cancerGeneticVariants[0].component.geneStudied[0].code.coding?.[0].code).toBe('48018-6');
    expect(
      CodeMapper.normalizeCodeSystem(
        extractedData.cancerGeneticVariants[0].component.geneStudied[0].valueCodeableConcept?.coding?.[0].system ??
          'null'
      )
    ).toBe(CodeSystemEnum.HGNC);
    expect(extractedData.cancerGeneticVariants[0].component.geneStudied[0].valueCodeableConcept?.coding?.[0].code).toBe(
      'HGNC:11389'
    );
    expect(
      extractedData.cancerGeneticVariants[0].component.geneStudied[0].interpretation?.[0]?.coding?.[0].system
    ).toBe('http://hl7.org/fhir/ValueSet/observation-interpretation');
    expect(extractedData.cancerGeneticVariants[0].component.geneStudied[0].interpretation?.[0].coding?.[0].code).toBe(
      'CAR'
    );
    expect(extractedData.cancerGeneticVariants[0].component.genomicsSourceClass[0].code.coding?.[0].system).toBe(
      'http://loinc.org'
    );
    expect(extractedData.cancerGeneticVariants[0].component.genomicsSourceClass[0].code.coding?.[0].code).toBe(
      '48002-0'
    );
    expect(
      extractedData.cancerGeneticVariants[0].component.genomicsSourceClass[0].valueCodeableConcept?.coding?.[0].system
    ).toBe('http://loinc.org');
    expect(
      extractedData.cancerGeneticVariants[0].component.genomicsSourceClass[0].valueCodeableConcept?.coding?.[0].code
    ).toBe('LA6684-0');
    expect(
      extractedData.cancerGeneticVariants[0].component.genomicsSourceClass[0].interpretation?.[0]?.coding?.[0].system
    ).toBe('http://hl7.org/fhir/ValueSet/observation-interpretation');
    expect(
      extractedData.cancerGeneticVariants[0].component.genomicsSourceClass[0].interpretation?.[0]?.coding?.[0].code
    ).toBe('A');
  });

  it('checkExtractedCancerRelatedMedicationStatement', function () {
    const extractedData = new mcode.mCODEextractor(sampleData);
    expect(extractedData.cancerRelatedMedicationStatements[0].code).toBe('583214');
  });
});

describe('Missing Birthdate/ECOG/Karnofsky ExtractedMCODE Import', () => {
  let sampleData: fhir.Bundle;
  beforeAll(async () => {
    sampleData = await loadSampleBundle('../../spec/data/patient_data_empty-cgv.json');
  });

  it('checkMissingBirthdateEcogKarnofsky', function () {
    const extractedData = new mcode.mCODEextractor(sampleData);
    expect(extractedData.birthDate).toBeNull();
    expect(extractedData.ecogPerformanceStatus).toBe(-1);
    expect(extractedData.karnofskyPerformanceStatus).toBe(-1);
  });
});

describe('Missing Histology Morphology', () => {
  let sampleData: fhir.Bundle;
  beforeAll(async () => {
    sampleData = await loadSampleBundle('../../spec/data/patient_data_missing_histology_morph.json');
  });

  it('Uses temporary Histology-Morphology', function () {
    const extractedData = new mcode.mCODEextractor(sampleData);
    expect(extractedData.primaryCancerConditions[0].histologyMorphologyBehavior.length).toBe(0);
  });
});

describe('Missing Extensions for Primary Cancer Condition', () => {
  let sampleData: fhir.Bundle;
  beforeAll(async () => {
    sampleData = await loadSampleBundle('../../spec/data/patient_data_missing_birthdate_invalid_ecog_karnofsky.json');
  });

  it('Uses temporary Histology-Morphology', function () {
    const extractedData = new mcode.mCODEextractor(sampleData);
    expect(extractedData.primaryCancerConditions[0].histologyMorphologyBehavior.length).toBe(0);
  });
});

describe('Missing Cancer Genetic Variant Attributes Test', () => {
  let sampleData: fhir.Bundle;
  beforeAll(async () => {
    sampleData = await loadSampleBundle('../../spec/data/patient_data_missing_birthdate_invalid_ecog_karnofsky.json');
  });

  it('checkMissingCgvAttributes', function () {
    const extractedData = new mcode.mCODEextractor(sampleData);
    expect(extractedData.cancerGeneticVariants.length).toBe(0);
  });
});

describe('error handling', () => {
  it('throws an error if given undefined or null', function () {
    expect(() => new mcode.mCODEextractor(undefined as unknown as fhir.Bundle)).toThrow(
      Error('Input Patient Bundle is invalid/has no entries')
    );
    expect(() => new mcode.mCODEextractor(null as unknown as fhir.Bundle)).toThrow(
      Error('Input Patient Bundle is invalid/has no entries')
    );
  });

  it('does not throw an error if a reference is missing', () => {
    new mcode.mCODEextractor({
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          resource: {
            resourceType: 'Condition',
            meta: {
              profile: [MCODE_PRIMARY_CANCER_CONDITION]
            },
            subject: {}
          }
        },
        {
          resource: {
            resourceType: 'Procedure',
            meta: {
              profile: [MCODE_CANCER_RELATED_SURGICAL_PROCEDURE]
            },
            status: 'completed',
            subject: {}
          }
        }
      ]
    });
  });
});
