import fs from 'fs';
import path from 'path';
import { Bundle } from '../src/fhir-types';
import { MappingLogic } from '../src/mappinglogic';

describe('Code Mapper Tests', () => {
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
          // The object we resolve to doesn't really matter
          resolve(sampleData);
        } catch (ex) {
          reject(error);
        }
      });
    });
  });

  it('Test getters.', function () {
    const mappingLogic = new DummyMappingLogic(sampleData);
    throw JSON.stringify(mappingLogic.getPrimaryCancerValues());
    expect(mappingLogic.getPrimaryCancerValues()).toBe('F');
  });
});

class DummyMappingLogic extends MappingLogic {
  getPrimaryCancerValues(): string {
    return this.getExtractedPrimaryCancerConditions().toString();
  }
  getSecondaryCancerValues(): string[] {
    return [this.getExtractedSecondaryCancerConditions().toString()];
  }
  getHistologyMorphologyValue(): string {
    return this.getExtractedPrimaryCancerConditions().toString();
  }
  getRadiationProcedureValues(): string[] {
    return [this.getExtractedCancerRelatedRadiationProcedures().toString()];
  }
  getSurgicalProcedureValues(): string[] {
    return [this.getExtractedCancerRelatedSurgicalProcedures().toString()];
  }
  getAgeValue(): number {
    return parseInt(this.getExtractedBirthDate());
  }
  getStageValues(): string {
    return this.getExtractedPrimaryCancerConditions().toString();
  }
  getTumorMarkerValues(): string[] {
    return [this.getExtractedTNMclinicalStageGroup().toString()];
  }
  getMedicationStatementValues(): string[] {
    return [this.getExtractedCancerRelatedMedicationStatements().toString()];
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
