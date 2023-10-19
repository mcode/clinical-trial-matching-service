import * as fhirpath from 'fhirpath';
import * as fhir from 'fhir/r4';

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
   * Extracted primary cancer conditions.
   */
  readonly primaryCancerConditions: PrimaryCancerCondition[];
  readonly secondaryCancerConditions: SecondaryCancerCondition[];
  readonly TNMClinicalStageGroups: fhir.Coding[];
  readonly TNMPathologicalStageGroups: fhir.Coding[];
  readonly birthDate: string;
  readonly tumorMarkers: TumorMarker[];
  readonly cancerGeneticVariants: CancerGeneticVariant[];
  readonly cancerRelatedRadiationProcedures: CancerRelatedRadiationProcedure[];
  readonly cancerRelatedSurgicalProcedures: CancerRelatedSurgicalProcedure[];
  readonly cancerRelatedMedicationStatements: fhir.Coding[];
  /**
   * Extracted ECOG performance status, or -1 if not found.
   */
  readonly ecogPerformanceStatus: number = -1;
  /**
   * Extracted Karnofsky performance status, or -1 if not found.
   */
  readonly karnofskyPerformanceStatus: number = -1;

  /**
   * Constructor.
   * @param patientBundle The patient bundle to build the mCODE mapping from.
   */
  public constructor(patientBundle: fhir.Bundle) {
    this.primaryCancerConditions = [] as PrimaryCancerCondition[];
    this.TNMClinicalStageGroups = [] as fhir.Coding[];
    this.TNMPathologicalStageGroups = [] as fhir.Coding[];
    this.secondaryCancerConditions = [] as SecondaryCancerCondition[];
    this.tumorMarkers = [] as TumorMarker[];
    this.cancerRelatedRadiationProcedures = [] as CancerRelatedRadiationProcedure[];
    this.cancerRelatedSurgicalProcedures = [] as CancerRelatedSurgicalProcedure[];
    this.cancerRelatedMedicationStatements = [] as fhir.Coding[];
    this.cancerGeneticVariants = [] as CancerGeneticVariant[];
    this.birthDate = 'N/A';

    if (patientBundle != undefined && patientBundle.entry) {
      for (const entry of patientBundle.entry) {
        if (!('resource' in entry) || !entry.resource) {
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
            this.lookup(resource, 'extension').forEach((_, index) => {
              if (
                (this.lookup(resource, `extension[${index}].url`)[0] as string).includes(
                  'mcode-histology-morphology-behavior'
                )
              ) {
                tempPrimaryCancerCondition.histologyMorphologyBehavior = this.lookup(
                  resource,
                  `extension[${index}].valueCodeableConcept.coding`
                ) as unknown as fhir.Coding[];
              }
            });
          }
          this.primaryCancerConditions.push(tempPrimaryCancerCondition);
        }

        if (
          resource.resourceType === 'Observation' &&
          this.resourceProfile(this.lookup(resource, 'meta.profile'), 'mcode-tnm-clinical-stage-group')
        ) {
          this.TNMClinicalStageGroups = this.addCoding(
            this.TNMClinicalStageGroups,
            this.lookup(resource, 'valueCodeableConcept.coding') as unknown as fhir.Coding[]
          );
        }

        if (
          resource.resourceType === 'Observation' &&
          this.resourceProfile(this.lookup(resource, 'meta.profile'), 'mcode-tnm-pathological-stage-group')
        ) {
          this.TNMPathologicalStageGroups = this.addCoding(
            this.TNMPathologicalStageGroups,
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
          this.secondaryCancerConditions.push(tempSecondaryCancerCondition); // needs specific de-dup helper function
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
          this.tumorMarkers.push(tempTumorMarker);
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
            } else {
              for (const currentComponentCode of currentComponent.code.coding) {
                if (currentComponentCode.code == '48018-6') {
                  // With this code, we've reached a GeneStudied. Populate the GeneStudied attribute.
                  tempCGV.component.geneStudied.push(currentComponent);
                }
                if (currentComponentCode.code == '48002-0') {
                  // With this code, we've reached a GenomicSourceClass. Populate the GenomicSourceClass attribute.
                  tempCGV.component.genomicsSourceClass.push(currentComponent);
                }
              }
            }
          }
          tempCGV.valueCodeableConcept = this.lookup(
            resource,
            'valueCodeableConcept.coding'
          ) as unknown as fhir.Coding[];
          tempCGV.interpretation = this.lookup(resource, 'interpretation.coding') as unknown as fhir.Coding[];
          this.cancerGeneticVariants.push(tempCGV);
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
          if (!this.listContainsProcedure(this.cancerRelatedRadiationProcedures, tempCancerRelatedRadiationProcedure)) {
            this.cancerRelatedRadiationProcedures.push(tempCancerRelatedRadiationProcedure);
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
          if (!this.listContainsProcedure(this.cancerRelatedSurgicalProcedures, tempCancerRelatedSurgicalProcedure)) {
            this.cancerRelatedSurgicalProcedures.push(tempCancerRelatedSurgicalProcedure);
          }
        }

        if (
          resource.resourceType === 'MedicationStatement' &&
          this.resourceProfile(this.lookup(resource, 'meta.profile'), 'mcode-cancer-related-medication-statement')
        ) {
          this.cancerRelatedMedicationStatements = this.addCoding(
            this.cancerRelatedMedicationStatements,
            this.lookup(resource, 'medicationCodeableConcept.coding') as unknown as fhir.Coding[]
          );
        }

        if (
          resource.resourceType === 'Observation' &&
          this.resourceProfile(this.lookup(resource, 'meta.profile'), 'mcode-ecog-performance-status')
        ) {
          this.ecogPerformanceStatus = this.lookup(resource, 'valueInteger')[0] as number; // this is probably bad type handling
        }

        if (
          resource.resourceType === 'Observation' &&
          this.resourceProfile(this.lookup(resource, 'meta.profile'), 'mcode-karnofsky-performance-status')
        ) {
          this.karnofskyPerformanceStatus = this.lookup(resource, 'valueInteger')[0] as number; // so is this
        }
      }
    } else {
      throw Error('Input Patient Bundle is null.');
    }

    // Checking if the performanceStatus exists and also making sure it's not 0, as 0 is a valid score
    if (!this.ecogPerformanceStatus && this.ecogPerformanceStatus != 0) {
      this.ecogPerformanceStatus = -1;
    }
    if (!this.karnofskyPerformanceStatus && this.karnofskyPerformanceStatus != 0) {
      this.karnofskyPerformanceStatus = -1;
    }

    // Once all resources are loaded, check to add the meta.profile for cancer related surgical procedure reason references.
    for (const procedure of this.cancerRelatedSurgicalProcedures) {
      const conditions: CancerConditionParent[] = (this.primaryCancerConditions as CancerConditionParent[]).concat(
        this.secondaryCancerConditions
      );
      const reasonReference = procedure.reasonReference;
      // reason can be undefined if reasonReference was missing/empty
      if (reasonReference) {
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
  }

  /**
   * Resource lookup.
   * @param resource
   * @param path
   * @param environment
   * @returns
   */
  private lookup(resource: fhir.Resource, path: FHIRPath, environment?: { [key: string]: string }): unknown[] {
    // The FHIR client Resource type definition is wrong (sort of) - it requires
    // that Meta references have a lastUpdated time. This is, in fact, optional,
    // so just jam it in.
    return fhirpath.evaluate(resource, path, environment);
  }

  /**
   * Checks if the given profile constains a match to the given key.
   */
  private resourceProfile(profiles: unknown[], key: string): boolean {
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
   * Adds the given coding to the given coding list.
   * @param codingList
   * @param codes
   * @returns
   */
  private addCoding(codingList: fhir.Coding[], codes: fhir.Coding[]): fhir.Coding[] {
    for (const code of codes) {
      if (!this.contains(codingList, code)) {
        codingList.push(code);
      }
    }
    return codingList;
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
