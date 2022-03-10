import * as fhir from "./fhir-types";
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

  /**
   * Extracted mCODE getters.
   */
  protected getExtractedPrimaryCancerConditions(): mcode.PrimaryCancerCondition[] {
    return this.extractedMcode.getPrimaryCancerConditions();
  }
  protected getExtractedSecondaryCancerConditions(): mcode.SecondaryCancerCondition[] {
    return this.extractedMcode.getSecondaryCancerConditions();
  }
  protected getExtractedTNMclinicalStageGroup(): fhir.Coding[] {
    return this.extractedMcode.getTNMclinicalStageGroup();
  }
  protected getExtractedTNMpathologicalStageGroup(): fhir.Coding[] {
    return this.extractedMcode.getTNMpathologicalStageGroup();
  }
  protected getExtractedBirthDate(): string {
    return this.extractedMcode.getBirthDate();
  }
  protected getExtractedTumorMarkers(): mcode.TumorMarker[] {
    return this.extractedMcode.getTumorMarkers();
  }
  protected getExtractedCancerGeneticVariants(): mcode.CancerGeneticVariant[] {
    return this.extractedMcode.getCancerGeneticVariants();
  }
  protected getExtractedCancerRelatedRadiationProcedures(): mcode.CancerRelatedRadiationProcedure[] {
    return this.extractedMcode.getCancerRelatedRadiationProcedures();
  }
  protected getExtractedCancerRelatedSurgicalProcedures(): mcode.CancerRelatedSurgicalProcedure[] {
    return this.extractedMcode.getCancerRelatedSurgicalProcedures();
  }
  protected getExtractedCancerRelatedMedicationStatements(): fhir.Coding[] {
    return this.extractedMcode.getCancerRelatedMedicationStatements();
  }
  protected getExtractedEcogPerformanceStatus(): number {
    return this.extractedMcode.getEcogPerformanceStatus();
  }
  protected getExtractedKarnofskyPerformanceStatus(): number {
    return this.extractedMcode.getKarnofskyPerformanceStatus();
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
