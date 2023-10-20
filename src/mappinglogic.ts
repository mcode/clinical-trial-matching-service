import * as fhir from 'fhir/r4';
import * as mcode from './mcodeextractor';

/**
 * A class that describes the mapping logic of the matching service.
 */
export abstract class MappingLogic {
  /**
   * The extracted mcode of the patient bundle.
   */
  private extractedMcode: mcode.mCODEextractor;

  /**
   * Constructor.
   * @param patientBundle
   */
  constructor(patientBundle: fhir.Bundle) {
    this.extractedMcode = new mcode.mCODEextractor(patientBundle);
  }

  /*
   * Extracted mCODE getters.
   */
  protected get extractedPrimaryCancerConditions(): mcode.PrimaryCancerCondition[] {
    return this.extractedMcode.primaryCancerConditions;
  }
  protected get extractedSecondaryCancerConditions(): mcode.SecondaryCancerCondition[] {
    return this.extractedMcode.secondaryCancerConditions;
  }
  protected get extractedTNMClinicalStageGroup(): fhir.Coding[] {
    return this.extractedMcode.TNMClinicalStageGroups;
  }
  protected get extractedTNMPathologicalStageGroup(): fhir.Coding[] {
    return this.extractedMcode.TNMPathologicalStageGroups;
  }
  protected get extractedBirthDate(): string | null {
    return this.extractedMcode.birthDate;
  }
  protected get extractedTumorMarkers(): mcode.TumorMarker[] {
    return this.extractedMcode.tumorMarkers;
  }
  protected get extractedCancerGeneticVariants(): mcode.CancerGeneticVariant[] {
    return this.extractedMcode.cancerGeneticVariants;
  }
  protected get extractedCancerRelatedRadiationProcedures(): mcode.CancerRelatedRadiationProcedure[] {
    return this.extractedMcode.cancerRelatedRadiationProcedures;
  }
  protected get extractedCancerRelatedSurgicalProcedures(): mcode.CancerRelatedSurgicalProcedure[] {
    return this.extractedMcode.cancerRelatedSurgicalProcedures;
  }
  protected get extractedCancerRelatedMedicationStatements(): fhir.Coding[] {
    return this.extractedMcode.cancerRelatedMedicationStatements;
  }
  protected get extractedEcogPerformanceStatus(): number {
    return this.extractedMcode.ecogPerformanceStatus;
  }
  protected get extractedKarnofskyPerformanceStatus(): number {
    return this.extractedMcode.karnofskyPerformanceStatus;
  }

  /**
   * Required method signatures.
   */
  abstract getPrimaryCancerValues(): string;
  abstract getSecondaryCancerValues(): string[] | string;
  abstract getHistologyMorphologyValue(): string;
  abstract getRadiationProcedureValues(): string[] | string;
  abstract getSurgicalProcedureValues(): string[] | string;
  abstract getAgeValue(): number | string;
  abstract getStageValues(): string | string[];
  abstract getTumorMarkerValues(): string[] | string;
  abstract getMedicationStatementValues(): string[];
  abstract getECOGScore(): number | string;
  abstract getKarnofskyScore(): number | string;
}
