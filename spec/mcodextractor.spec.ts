import fs from 'fs';
import path from 'path';
import * as fhir from '../src/fhir-types';
import {CodeMapper, CodeSystemEnum} from '../src/codeMapper';
import * as mcode from '../src/mcodeextractor';

describe('ExtractedMCODE Import', () => {
  let sampleData: fhir.Bundle;
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
          sampleData = JSON.parse(data) as fhir.Bundle;
          // The object we resolve to doesn't really matter
          resolve(sampleData);
        } catch (ex) {
          reject(error);
        }
      });
    });
  });

  it('checksCountOfExtractedProfiles', function () {
    const extractedData = new mcode.mCODEextractor(sampleData);
    expect(extractedData.getPrimaryCancerConditions().length).toBe(1);
    expect(extractedData.getTNMclinicalStageGroup().length).toBe(2);
    expect(extractedData.getTNMpathologicalStageGroup().length).toBe(2);
    expect(extractedData.getSecondaryCancerConditions().length).toBe(2);
    expect(extractedData.getBirthDate()).toBe('1966-08-03');
    expect(extractedData.getTumorMarkers().length).toBe(3);
    expect(extractedData.getCancerRelatedRadiationProcedures().length).toBe(2);
    expect(extractedData.getCancerRelatedSurgicalProcedures().length).toBe(3);
    expect(extractedData.getCancerRelatedMedicationStatements().length).toBe(1);
    expect(extractedData.getCancerGeneticVariants().length).toBe(2);
    expect(extractedData.getEcogPerformanceStatus()).toBe(3);
    expect(extractedData.getKarnofskyPerformanceStatus()).toBe(90);
  });

  it('checkExtractedPrimaryCancerCondition', function () {
    const extractedData = new mcode.mCODEextractor(sampleData);
    expect(extractedData.getPrimaryCancerConditions()[0].clinicalStatus[0].code).toBe('active');
    expect(extractedData.getPrimaryCancerConditions()[0].coding[0].code).toBe('254837009');
    expect(extractedData.getPrimaryCancerConditions()[0].histologyMorphologyBehavior[0].code).toBe('367651003');
    expect(extractedData.getPrimaryCancerConditions()[0].meta_profile).toBe('mcode-primary-cancer-condition');
  });

  it('checkExtractedTNMClinicalStageGroup', function () {
    const extractedData = new mcode.mCODEextractor(sampleData);
    expect(extractedData.getTNMclinicalStageGroup()[0].code).toBe('261638004');
    expect(extractedData.getTNMclinicalStageGroup()[1].code).toBe('c3A');
  });

  it('checkExtractedTNMPathologicalStageGroup', function () {
    const extractedData = new mcode.mCODEextractor(sampleData);
    expect(extractedData.getTNMpathologicalStageGroup()[0].code).toBe('261638004');
    expect(extractedData.getTNMpathologicalStageGroup()[1].code).toBe('c3A');
  });

  it('checkExtractedSecondaryCancerCondition', function () {
    const extractedData = new mcode.mCODEextractor(sampleData);
    expect(extractedData.getSecondaryCancerConditions()[0].clinicalStatus[0].code).toBe('active');
    expect(extractedData.getSecondaryCancerConditions()[0].coding[0].code).toBe('128462008');
    expect(extractedData.getSecondaryCancerConditions()[0].bodySite[0].code).toBe('8935007');
    expect(extractedData.getSecondaryCancerConditions()[0].meta_profile).toBe('mcode-secondary-cancer-condition');
  });

  it('checkExtractedTumorMarker', function () {
    const extractedData = new mcode.mCODEextractor(sampleData);
    expect(
      extractedData.getTumorMarkers().some(
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
      extractedData.getTumorMarkers().some(
        (marker) =>
          marker.valueCodeableConcept[0].code == '10828004' &&
          marker.valueQuantity.length == 0 &&
          marker.valueRatio[0].numerator!.value == 1 &&
          marker.valueRatio[0].numerator!.comparator == '>=' &&
          marker.valueRatio[0].denominator!.value == 100 &&
          marker.coding[0].code == '48676-1' &&
          marker.coding[1].code == '85318-4' &&
          marker.interpretation.length == 0
      )
    ).toBeTrue();
    expect(
      extractedData.getTumorMarkers().some(
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
      extractedData.getCancerRelatedRadiationProcedures().some(
        (procedure) => procedure.coding[0].code == '448385000' && procedure.bodySite.length == 0
      )
    ).toBeTrue();
    expect(
      extractedData.getCancerRelatedRadiationProcedures().some(
        (procedure) =>
          procedure.coding[0].code == '448385000' &&
          procedure.bodySite.length != 0 &&
          procedure.bodySite[0].code == '12738006'
      )
    ).toBeTrue();
  });

  it('checkExtractedCancerRelatedSurgicalProcedure', function () {
    const extractedData = new mcode.mCODEextractor(sampleData);
    expect(extractedData.getCancerRelatedSurgicalProcedures().some((procedure) => procedure.coding[0].code == '396487001')).toBeTrue();
    expect(extractedData.getCancerRelatedSurgicalProcedures().some((procedure) => procedure.coding[0].code == '443497002')).toBeTrue();
    expect(extractedData.getCancerRelatedSurgicalProcedures().some((procedure) => procedure.reasonReference.meta_profile == 'mcode-primary-cancer-condition')).toBeTrue();
    expect(extractedData.getCancerRelatedSurgicalProcedures().some((procedure) => procedure.reasonReference.meta_profile == 'mcode-secondary-cancer-condition')).toBeTrue();
  });

  it('checkExtractedCancerGeneticVariant', function () {
    const extractedData = new mcode.mCODEextractor(sampleData);
    expect(extractedData.getCancerGeneticVariants()[0].coding[0].system).toBe('http://loinc.org');
    expect(extractedData.getCancerGeneticVariants()[0].coding[0].code).toBe('69548-6');
    expect(extractedData.getCancerGeneticVariants()[0].valueCodeableConcept[0].system).toBe('http://loinc.org');
    expect(extractedData.getCancerGeneticVariants()[0].valueCodeableConcept[0].code).toBe('LA9633-4');
    expect(extractedData.getCancerGeneticVariants()[0].interpretation[0].system).toBe(
      'http://hl7.org/fhir/ValueSet/observation-interpretation'
    );
    expect(extractedData.getCancerGeneticVariants()[0].interpretation[0].code).toBe('POS');
    expect(extractedData.getCancerGeneticVariants()[0].component.geneStudied[0].code.coding[0].system).toBe(
      'http://loinc.org'
    );
    expect(extractedData.getCancerGeneticVariants()[0].component.geneStudied[0].code.coding[0].code).toBe('48018-6');
    expect(
      CodeMapper.normalizeCodeSystem(
        extractedData.getCancerGeneticVariants()[0].component.geneStudied[0].valueCodeableConcept.coding[0].system
      )
    ).toBe(CodeSystemEnum.HGNC);
    expect(extractedData.getCancerGeneticVariants()[0].component.geneStudied[0].valueCodeableConcept.coding[0].code).toBe(
      'HGNC:11389'
    );
    expect(extractedData.getCancerGeneticVariants()[0].component.geneStudied[0].interpretation.coding[0].system).toBe(
      'http://hl7.org/fhir/ValueSet/observation-interpretation'
    );
    expect(extractedData.getCancerGeneticVariants()[0].component.geneStudied[0].interpretation.coding[0].code).toBe('CAR');
    expect(extractedData.getCancerGeneticVariants()[0].component.genomicsSourceClass[0].code.coding[0].system).toBe(
      'http://loinc.org'
    );
    expect(extractedData.getCancerGeneticVariants()[0].component.genomicsSourceClass[0].code.coding[0].code).toBe('48002-0');
    expect(
      extractedData.getCancerGeneticVariants()[0].component.genomicsSourceClass[0].valueCodeableConcept.coding[0].system
    ).toBe('http://loinc.org');
    expect(
      extractedData.getCancerGeneticVariants()[0].component.genomicsSourceClass[0].valueCodeableConcept.coding[0].code
    ).toBe('LA6684-0');
    expect(extractedData.getCancerGeneticVariants()[0].component.genomicsSourceClass[0].interpretation.coding[0].system).toBe(
      'http://hl7.org/fhir/ValueSet/observation-interpretation'
    );
    expect(extractedData.getCancerGeneticVariants()[0].component.genomicsSourceClass[0].interpretation.coding[0].code).toBe(
      'A'
    );
  });

  it('checkExtractedCancerRelatedMedicationStatement', function () {
    const extractedData = new mcode.mCODEextractor(sampleData);
    expect(extractedData.getCancerRelatedMedicationStatements()[0].code).toBe('583214');
  });
});

describe('Missing Birthdate/ECOG/Karnofsky ExtractedMCODE Import', () => {
  let sampleData: fhir.Bundle;
  beforeAll(() => {
    return new Promise((resolve, reject) => {
      const patientDataPath = path.join(__dirname, '../../spec/data/patient_data_empty-cgv.json');
      fs.readFile(patientDataPath, { encoding: 'utf8' }, (error, data) => {
        if (error) {
          console.error('Could not read spec file');
          reject(error);
          return;
        }
        try {
          sampleData = JSON.parse(data) as fhir.Bundle;
          // The object we resolve to doesn't really matter
          resolve(sampleData);
        } catch (ex) {
          reject(error);
        }
      });
    });
  });

  it('checkMissingBirthdateEcogKarnofsky', function () {
    const extractedData = new mcode.mCODEextractor(sampleData);
    expect(extractedData.getBirthDate()).toBe('N/A');
    expect(extractedData.getEcogPerformanceStatus()).toBe(-1)
    expect(extractedData.getKarnofskyPerformanceStatus()).toBe(-1)
  });
});

describe('Missing Cancer Genetic Variant Attributes Test', () => {
  let sampleData: fhir.Bundle;
  beforeAll(() => {
    return new Promise((resolve, reject) => {
      const patientDataPath = path.join(__dirname, '../../spec/data/patient_data_missing_birthdate_invalid_ecog_karnofsky.json');
      fs.readFile(patientDataPath, { encoding: 'utf8' }, (error, data) => {
        if (error) {
          console.error('Could not read spec file');
          reject(error);
          return;
        }
        try {
          sampleData = JSON.parse(data) as fhir.Bundle;
          // The object we resolve to doesn't really matter
          resolve(sampleData);
        } catch (ex) {
          reject(error);
        }
      });
    });
  });

  it('checkMissingCgvAttributes', function () {
    const extractedData = new mcode.mCODEextractor(sampleData);
    expect(extractedData.getCancerGeneticVariants().length).toBe(0)
  });
});

describe('Null Patient Bundle Test', () => {
  it('Null Patient Bundle Test.', function () {
    const testFunc = () => new mcode.mCODEextractor(undefined as unknown as fhir.Bundle);
    expect(testFunc).toThrow(Error('Input Patient Bundle is null.'));
  });
});
