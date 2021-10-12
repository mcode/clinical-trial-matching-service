import { fhirclient } from 'fhirclient/lib/types';
import fhirpath from 'fhirpath';
import * as fhir from './fhir-types';

export type FHIRPath = string;

export interface ReasonReference {
  reference?: string;
  display?: string;
  meta_profile?: string;
}

export interface Quantity {
  value?: number | string;
  comparator?: string;
  unit?: string;
  system?: string;
  code?: string;
}

export interface Ratio {
  numerator?: Quantity;
  denominator?: Quantity;
}

export interface BaseFhirResource {
  coding: fhir.Coding[];
}

export interface CancerConditionParent extends BaseFhirResource {
  clinicalStatus: fhir.Coding[];
  meta_profile: string;
  id: string;
}

export interface PrimaryCancerCondition extends CancerConditionParent {
  histologyMorphologyBehavior: fhir.Coding[];
}

export interface SecondaryCancerCondition extends CancerConditionParent {
  bodySite: fhir.Coding[];
}

export interface CancerRelatedProcedureParent extends BaseFhirResource {
  bodySite: fhir.Coding[];
}

export interface CancerRelatedRadiationProcedure extends CancerRelatedProcedureParent {
  mcodeTreatmentIntent: fhir.Coding[];
}

export interface CancerRelatedSurgicalProcedure extends CancerRelatedProcedureParent {
  reasonReference: ReasonReference;
}

export interface TumorMarker extends BaseFhirResource {
  valueQuantity: Quantity[];
  valueRatio: Ratio[];
  valueCodeableConcept: fhir.Coding[];
  interpretation: fhir.Coding[];
}

export interface CancerGeneticVariant extends BaseFhirResource {
  component: CancerGeneticVariantComponent;
  valueCodeableConcept: fhir.Coding[];
  interpretation: fhir.Coding[];
}

export interface CancerGeneticVariantComponent {
  geneStudied: CancerGeneticVariantComponentType[];
  genomicsSourceClass: CancerGeneticVariantComponentType[];
}

export interface CancerGeneticVariantComponentType {
  code: { coding: fhir.Coding[] };
  valueCodeableConcept: { coding: fhir.Coding[] };
  interpretation: { coding: fhir.Coding[] };
}

/**
 * Class that extracts mCODE data from a patient record.
 */
export class mCODEextractor {
  /**
   * mCODE Resources.
   */
  private primaryCancerCondition: PrimaryCancerCondition[];
  private secondaryCancerCondition: SecondaryCancerCondition[];
  private TNMClinicalStageGroup: fhir.Coding[];
  private TNMPathologicalStageGroup: fhir.Coding[];
  private birthDate: string;
  private tumorMarker: TumorMarker[];
  private cancerGeneticVariant: CancerGeneticVariant[];
  private cancerRelatedRadiationProcedure: CancerRelatedRadiationProcedure[];
  private cancerRelatedSurgicalProcedure: CancerRelatedSurgicalProcedure[];
  private cancerRelatedMedicationStatement: fhir.Coding[];
  private ecogPerformaceStatus?: number;
  private karnofskyPerformanceStatus?: number;

  /**
   * Getters.
   */
  getPrimaryCancerConditions(): PrimaryCancerCondition[] {
    return this.primaryCancerCondition;
  }
  getSecondaryCancerConditions(): SecondaryCancerCondition[] {
    return this.secondaryCancerCondition;
  }
  getTNMclinicalStageGroup(): fhir.Coding[] {
    return this.TNMClinicalStageGroup;
  }
  getTNMpathologicalStageGroup(): fhir.Coding[] {
    return this.TNMPathologicalStageGroup;
  }
  getBirthDate(): string {
    return this.birthDate;
  }
  getTumorMarkers(): TumorMarker[] {
    return this.tumorMarker;
  }
  getCancerGeneticVariants(): CancerGeneticVariant[] {
    return this.cancerGeneticVariant;
  }
  getCancerRelatedRadiationProcedures(): CancerRelatedRadiationProcedure[] {
    return this.cancerRelatedRadiationProcedure;
  }
  getCancerRelatedSurgicalProcedures(): CancerRelatedSurgicalProcedure[] {
    return this.cancerRelatedSurgicalProcedure;
  }
  getCancerRelatedMedicationStatements(): fhir.Coding[] {
    return this.cancerRelatedMedicationStatement;
  }
  getEcogPerformaceStatus(): number {
    return this.ecogPerformaceStatus ? this.ecogPerformaceStatus : -1;
  }
  getKarnofskyPerformanceStatus(): number {
    return this.karnofskyPerformanceStatus ? this.karnofskyPerformanceStatus : -1;
  }

  /**
   * Constructor.
   * @param patientBundle The patient bundle to build the mCODE mapping from.
   */
  public constructor(patientBundle: fhir.Bundle) {
    this.primaryCancerCondition = [] as PrimaryCancerCondition[];
    this.TNMClinicalStageGroup = [] as fhir.Coding[];
    this.TNMPathologicalStageGroup = [] as fhir.Coding[];
    this.secondaryCancerCondition = [] as SecondaryCancerCondition[];
    this.tumorMarker = [] as TumorMarker[];
    this.cancerRelatedRadiationProcedure = [] as CancerRelatedRadiationProcedure[];
    this.cancerRelatedSurgicalProcedure = [] as CancerRelatedSurgicalProcedure[];
    this.cancerRelatedMedicationStatement = [] as fhir.Coding[];
    this.cancerGeneticVariant = [] as CancerGeneticVariant[];
    this.birthDate = 'N/A';

    if (patientBundle != null) {
      for (const entry of patientBundle.entry) {
        if (!('resource' in entry)) {
          // Skip bad entries
          continue;
        }
        const resource = entry.resource;

        if (
          resource.resourceType === 'Condition' &&
          this.resourceProfile(this.lookup(resource, 'meta.profile'), 'mcode-primary-cancer-condition')
        ) {
          const tempPrimaryCancerCondition: PrimaryCancerCondition = {
            clinicalStatus: this.lookup(resource, 'clinicalStatus.coding') as unknown as fhir.Coding[],
            meta_profile: 'mcode-primary-cancer-condition',
            histologyMorphologyBehavior: [] as fhir.Coding[],
            coding: this.lookup(resource, 'code.coding') as unknown as fhir.Coding[],
            id: (this.lookup(resource, 'id') as string[])[0]
          };
          if (this.lookup(resource, 'extension').length !== 0) {
            let count = 0;
            for (const extension of this.lookup(resource, 'extension')) {
              if (
                (this.lookup(resource, `extension[${count}].url`)[0] as string).includes(
                  'mcode-histology-morphology-behavior'
                )
              ) {
                tempPrimaryCancerCondition.histologyMorphologyBehavior = this.lookup(
                  resource,
                  `extension[${count}].valueCodeableConcept.coding`
                ) as unknown as fhir.Coding[];
              }
              count++;
            }
          }
          this.primaryCancerCondition.push(tempPrimaryCancerCondition);
        }

        if (
          resource.resourceType === 'Observation' &&
          this.resourceProfile(this.lookup(resource, 'meta.profile'), 'mcode-tnm-clinical-stage-group')
        ) {
          this.TNMClinicalStageGroup = this.addCoding(
            this.TNMClinicalStageGroup,
            this.lookup(resource, 'valueCodeableConcept.coding') as unknown as fhir.Coding[]
          );
        }

        if (
          resource.resourceType === 'Observation' &&
          this.resourceProfile(this.lookup(resource, 'meta.profile'), 'mcode-tnm-pathological-stage-group')
        ) {
          this.TNMPathologicalStageGroup = this.addCoding(
            this.TNMPathologicalStageGroup,
            this.lookup(resource, 'valueCodeableConcept.coding') as unknown as fhir.Coding[]
          );
        }

        if (
          resource.resourceType === 'Condition' &&
          this.resourceProfile(this.lookup(resource, 'meta.profile'), 'mcode-secondary-cancer-condition')
        ) {
          const tempSecondaryCancerCondition: SecondaryCancerCondition = {
            clinicalStatus: this.lookup(resource, 'clinicalStatus.coding') as unknown as fhir.Coding[],
            meta_profile: 'mcode-secondary-cancer-condition',
            id: (this.lookup(resource, 'id') as string[])[0],
            bodySite: this.lookup(resource, 'bodySite.coding') as unknown as fhir.Coding[],
            coding: this.lookup(resource, 'code.coding') as unknown as fhir.Coding[]
          };
          this.secondaryCancerCondition.push(tempSecondaryCancerCondition); // needs specific de-dup helper function
        }

        if (
          resource.resourceType === 'Patient' &&
          this.resourceProfile(this.lookup(resource, 'meta.profile'), 'mcode-cancer-patient')
        ) {
          if (this.lookup(resource, 'birthDate').length !== 0) {
            this.birthDate = this.lookup(resource, 'birthDate')[0] as string;
          } else {
            this.birthDate = 'NA';
          }
        }

        if (
          resource.resourceType === 'Observation' &&
          this.resourceProfile(this.lookup(resource, 'meta.profile'), 'mcode-tumor-marker')
        ) {
          const tempTumorMarker: TumorMarker = {
            valueQuantity: this.lookup(resource, 'valueQuantity') as Quantity[],
            valueRatio: this.lookup(resource, 'valueRatio') as Ratio[],
            valueCodeableConcept: this.lookup(resource, 'valueCodeableConcept.coding') as unknown as fhir.Coding[],
            interpretation: this.lookup(resource, 'interpretation.coding') as unknown as fhir.Coding[],
            coding: this.lookup(resource, 'code.coding') as unknown as fhir.Coding[]
          };
          this.tumorMarker.push(tempTumorMarker);
        }
        // Parse and Extract mCODE Cancer Genetic Variant
        if (
          resource.resourceType === 'Observation' &&
          this.resourceProfile(this.lookup(resource, 'meta.profile'), 'mcode-cancer-genetic-variant')
        ) {
          const tempCGV: CancerGeneticVariant = {
            coding: this.lookup(resource, 'code.coding') as unknown as fhir.Coding[],
            component: {
              geneStudied: [] as CancerGeneticVariantComponentType[],
              genomicsSourceClass: [] as CancerGeneticVariantComponentType[]
            },
            valueCodeableConcept: [],
            interpretation: []
          };
          for (const currentComponent of this.lookup(
            resource,
            'component'
          ) as unknown as CancerGeneticVariantComponentType[]) {
            if (currentComponent.code == undefined) {
              continue;
            }
            if (currentComponent.code.coding[0].code == '48018-6') {
              // With this code, we've reached a GeneStudied. Populate the GeneStudied attribute.
              if (tempCGV.component == undefined || tempCGV.component.geneStudied == undefined) {
                continue;
              }
              tempCGV.component.geneStudied.push(currentComponent);
            }
            if (currentComponent.code.coding[0].code == '48002-0') {
              // With this code, we've reached a GenomicSourceClass. Populate the GenomicSourceClass attribute.
              if (tempCGV.component == undefined || tempCGV.component.genomicsSourceClass == undefined) {
                continue;
              }
              tempCGV.component.genomicsSourceClass.push(currentComponent);
            }
          }
          tempCGV.valueCodeableConcept = this.lookup(
            resource,
            'valueCodeableConcept.coding'
          ) as unknown as fhir.Coding[];
          tempCGV.interpretation = this.lookup(resource, 'interpretation.coding') as unknown as fhir.Coding[];
          this.cancerGeneticVariant.push(tempCGV);
        }

        if (
          resource.resourceType === 'Procedure' &&
          this.resourceProfile(this.lookup(resource, 'meta.profile'), 'mcode-cancer-related-radiation-procedure')
        ) {
          const tempCancerRelatedRadiationProcedure: CancerRelatedRadiationProcedure = {
            bodySite: this.lookup(resource, 'bodySite.coding') as unknown as fhir.Coding[],
            mcodeTreatmentIntent: [],
            coding: this.lookup(resource, 'code.coding') as unknown as fhir.Coding[]
          };
          if (!this.listContainsProcedure(this.cancerRelatedRadiationProcedure, tempCancerRelatedRadiationProcedure)) {
            this.cancerRelatedRadiationProcedure.push(tempCancerRelatedRadiationProcedure);
          }
        }

        if (
          resource.resourceType === 'Procedure' &&
          this.resourceProfile(this.lookup(resource, 'meta.profile'), 'mcode-cancer-related-surgical-procedure')
        ) {
          const tempCancerRelatedSurgicalProcedure: CancerRelatedSurgicalProcedure = {
            bodySite: this.lookup(resource, 'bodySite.coding') as unknown as fhir.Coding[],
            reasonReference: (this.lookup(resource, 'reasonReference') as ReasonReference[])[0],
            coding: this.lookup(resource, 'code.coding') as unknown as fhir.Coding[]
          };
          if (!this.listContainsProcedure(this.cancerRelatedSurgicalProcedure, tempCancerRelatedSurgicalProcedure)) {
            this.cancerRelatedSurgicalProcedure.push(tempCancerRelatedSurgicalProcedure);
          }
        }

        if (
          resource.resourceType === 'MedicationStatement' &&
          this.resourceProfile(this.lookup(resource, 'meta.profile'), 'mcode-cancer-related-medication-statement')
        ) {
          this.cancerRelatedMedicationStatement = this.addCoding(
            this.cancerRelatedMedicationStatement,
            this.lookup(resource, 'medicationCodeableConcept.coding') as unknown as fhir.Coding[]
          );
        }

        if (
          resource.resourceType === 'Observation' &&
          this.resourceProfile(this.lookup(resource, 'meta.profile'), 'mcode-ecog-performance-status')
        ) {
          this.ecogPerformaceStatus = this.lookup(resource, 'valueInteger')[0] as number; // this is probably bad type handling
        }

        if (
          resource.resourceType === 'Observation' &&
          this.resourceProfile(this.lookup(resource, 'meta.profile'), 'mcode-karnofsky-performance-status')
        ) {
          this.karnofskyPerformanceStatus = this.lookup(resource, 'valueInteger')[0] as number; // so is this
        }
      }
    }

    // Checking if the performanceStatus exists and also making sure it's not 0, as 0 is a valid score
    if (!this.ecogPerformaceStatus && this.ecogPerformaceStatus != 0) {
      this.ecogPerformaceStatus = undefined;
    }
    if (!this.karnofskyPerformanceStatus && this.karnofskyPerformanceStatus != 0) {
      this.karnofskyPerformanceStatus = undefined;
    }

    // Once all resources are loaded, check to add the meta.profile for cancer related surgical procedure reason references.
    for (const procedure of this.cancerRelatedSurgicalProcedure) {
      const conditions: CancerConditionParent[] = (this.primaryCancerCondition as CancerConditionParent[]).concat(
        this.secondaryCancerCondition
      );
      const reasonReference = procedure.reasonReference;
      for (const condition of conditions) {
        if (condition.id === reasonReference.reference) {
          const reasonReferenceResult = {
            reference: reasonReference.reference,
            display: reasonReference.display,
            meta_profile: condition.meta_profile
          } as ReasonReference;
          procedure.reasonReference = reasonReferenceResult;
        }
      }
    }
  }

  /**
   * Resource lookup.
   * @param resource
   * @param path
   * @param environment
   * @returns
   */
  private lookup(
    resource: fhirclient.FHIR.Resource,
    path: FHIRPath,
    environment?: { [key: string]: string }
  ): fhirpath.PathLookupResult[] {
    return fhirpath.evaluate(resource, path, environment);
  }

  /**
   * Checks if the given profile constains a match to the given key.
   */
  private resourceProfile(profiles: fhirpath.PathLookupResult[], key: string): boolean {
    for (const profile of profiles) {
      if ((profile as string).includes(key)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks whether the given list contains the given coding.
   * @param codingList
   * @param coding
   * @returns
   */
  private contains(codingList: fhir.Coding[], coding: fhir.Coding): boolean {
    return codingList.some((list_coding) => list_coding.system === coding.system && list_coding.code === coding.code);
  }

  /**
   * Adds the given coding to the given coding.
   * @param codingList
   * @param codes
   * @returns
   */
  private addCoding(codingList: fhir.Coding[], codes: fhir.Coding[]): fhir.Coding[] {
    if (codingList) {
      for (const code of codes) {
        if (!this.contains(codingList, code)) {
          codingList.push(code);
        }
      }
      return codingList;
    } else {
      return codes;
    }
  }

  /**
   * Returns whether the given list contains the given procedure.
   * @param procedureList
   * @param procedure
   * @returns
   */
  listContainsProcedure(
    procedureList: CancerRelatedProcedureParent[],
    procedure: CancerRelatedProcedureParent
  ): boolean {
    for (const storedProcedure of procedureList) {
      if (
        procedure.coding.every((coding1) =>
          storedProcedure.coding.some((coding2) => coding1.system == coding2.system && coding1.code == coding2.code)
        ) &&
        (!procedure.bodySite ||
          !storedProcedure.bodySite ||
          procedure.bodySite.every((coding1) =>
            storedProcedure.coding.some((coding2) => coding1.system == coding2.system && coding1.code == coding2.code)
          ))
      ) {
        return true;
      }
    }
    return false;
  }
}
