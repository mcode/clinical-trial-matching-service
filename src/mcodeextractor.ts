import * as fhirpath from 'fhirpath';
import * as fhir from 'fhir/r4';

import {
  MCODE_CANCER_GENETIC_VARIANT,
  MCODE_CANCER_PATIENT,
  MCODE_CANCER_RELATED_MEDICATION_STATEMENT,
  MCODE_CANCER_RELATED_RADIATION_PROCEDURE,
  MCODE_CANCER_RELATED_SURGICAL_PROCEDURE,
  MCODE_ECOG_PERFORMANCE_STATUS,
  MCODE_HISTOLOGY_MORPHOLOGY_BEHAVIOR,
  MCODE_KARNOFSKY_PERFORMANCE_STATUS,
  MCODE_PRIMARY_CANCER_CONDITION,
  MCODE_SECONDARY_CANCER_CONDITION,
  MCODE_TNM_CLINICAL_STAGE_GROUP,
  MCODE_TNM_PATHOLOGICAL_STAGE_GROUP,
  MCODE_TUMOR_MARKER
} from './mcode';
import { resourceContainsProfile } from './fhir-util';

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
  id?: string;
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
 * Extract coding from a codeable concept. Exported to allow testing.
 * @param codeableConcept the codeable concept to check
 * @return either the coding values or an empty array if not found
 */
export function extractCoding(codeableConcept: fhir.CodeableConcept[] | fhir.CodeableConcept | undefined): fhir.Coding[] {
  if (codeableConcept) {
    if (Array.isArray(codeableConcept)) {
      // This is basically an overload, but in this case, we want to concatenate
      // all the codings together into one array
      const coding: fhir.Coding[] = [];
      for (const concept of codeableConcept) {
        if (Array.isArray(concept.coding)) {
          coding.push(...concept.coding);
        }
      }
      return coding;
    } else {
      const coding = codeableConcept.coding;
      if (Array.isArray(coding)) {
        return coding;
      }
    }
  }
  return [];
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
  /**
   * Birth date. String if date was found, null if a birth date was not given.
   */
  readonly birthDate: string | null;
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
    this.birthDate = null;

    if (patientBundle != undefined && patientBundle.entry) {
      for (const entry of patientBundle.entry) {
        const resource = entry.resource;
        if (typeof resource !== 'object' || resource === null) {
          // Skip invalid resources
          continue;
        }

        if (resource.resourceType === 'Condition') {
          if (resourceContainsProfile(resource, MCODE_PRIMARY_CANCER_CONDITION)) {
            const tempPrimaryCancerCondition: PrimaryCancerCondition = {
              clinicalStatus: extractCoding(resource.clinicalStatus),
              meta_profile: 'mcode-primary-cancer-condition',
              histologyMorphologyBehavior: [],
              coding: extractCoding(resource.code),
              id: resource.id
            };
            const extensions = resource.extension;
            if (Array.isArray(extensions)) {
              for (const extension of extensions) {
                if (extension.url === MCODE_HISTOLOGY_MORPHOLOGY_BEHAVIOR) {
                  const coding = extension.valueCodeableConcept?.coding;
                  if (Array.isArray(coding)) {
                    tempPrimaryCancerCondition.histologyMorphologyBehavior = coding;
                  }
                }
              }
            }
            this.primaryCancerConditions.push(tempPrimaryCancerCondition);
          }
          if (resourceContainsProfile(resource, MCODE_SECONDARY_CANCER_CONDITION)) {
            const tempSecondaryCancerCondition: SecondaryCancerCondition = {
              clinicalStatus: extractCoding(resource.clinicalStatus),
              meta_profile: 'mcode-secondary-cancer-condition',
              id: resource.id,
              bodySite: extractCoding(resource.bodySite),
              coding: this.lookup(resource, 'code.coding') as unknown as fhir.Coding[]
            };
            this.secondaryCancerConditions.push(tempSecondaryCancerCondition); // needs specific de-dup helper function
          }
        }

        if (resource.resourceType === 'Observation') {
          if (resourceContainsProfile(resource, MCODE_TNM_CLINICAL_STAGE_GROUP)) {
            this.TNMClinicalStageGroups = this.addCoding(
              this.TNMClinicalStageGroups,
              resource.valueCodeableConcept?.coding
            );
          }
          if (resourceContainsProfile(resource, MCODE_TNM_PATHOLOGICAL_STAGE_GROUP)) {
            this.TNMPathologicalStageGroups = this.addCoding(
              this.TNMPathologicalStageGroups,
              resource.valueCodeableConcept?.coding
            );
          }
          if (resourceContainsProfile(resource, MCODE_TUMOR_MARKER)) {
            const tempTumorMarker: TumorMarker = {
              valueQuantity: this.lookup(resource, 'valueQuantity') as Quantity[],
              valueRatio: this.lookup(resource, 'valueRatio') as Ratio[],
              valueCodeableConcept: extractCoding(resource.valueCodeableConcept),
              interpretation: extractCoding(resource.interpretation),
              coding: extractCoding(resource.code)
            };
            this.tumorMarkers.push(tempTumorMarker);
          }
          // Parse and Extract mCODE Cancer Genetic Variant
          if (resourceContainsProfile(resource, MCODE_CANCER_GENETIC_VARIANT)) {
            const tempCGV: CancerGeneticVariant = {
              coding: extractCoding(resource.code),
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
            tempCGV.valueCodeableConcept = extractCoding(resource.valueCodeableConcept);
            tempCGV.interpretation = extractCoding(resource.interpretation);
            this.cancerGeneticVariants.push(tempCGV);
          }
          if (resourceContainsProfile(resource, MCODE_ECOG_PERFORMANCE_STATUS)) {
            if (typeof resource.valueInteger === 'number') this.ecogPerformanceStatus = resource.valueInteger;
          }

          if (resourceContainsProfile(resource, MCODE_KARNOFSKY_PERFORMANCE_STATUS)) {
            if (typeof resource.valueInteger === 'number') this.karnofskyPerformanceStatus = resource.valueInteger;
          }
        }

        if (
          resource.resourceType === 'Patient' &&
          // FIXME: Really constrain to resources with this profile? This does not appear to be set in the app!
          resourceContainsProfile(resource, MCODE_CANCER_PATIENT)
        ) {
          if (resource.birthDate) {
            this.birthDate = resource.birthDate;
          }
        }

        if (resource.resourceType === 'Procedure') {
          if (resourceContainsProfile(resource, MCODE_CANCER_RELATED_RADIATION_PROCEDURE)) {
            const tempCancerRelatedRadiationProcedure: CancerRelatedRadiationProcedure = {
              bodySite: extractCoding(resource.bodySite),
              mcodeTreatmentIntent: [],
              coding: extractCoding(resource.code)
            };
            if (
              !this.listContainsProcedure(this.cancerRelatedRadiationProcedures, tempCancerRelatedRadiationProcedure)
            ) {
              this.cancerRelatedRadiationProcedures.push(tempCancerRelatedRadiationProcedure);
            }
          }

          if (resourceContainsProfile(resource, MCODE_CANCER_RELATED_SURGICAL_PROCEDURE)) {
            const tempCancerRelatedSurgicalProcedure: CancerRelatedSurgicalProcedure = {
              bodySite: extractCoding(resource.bodySite),
              reasonReference: (this.lookup(resource, 'reasonReference') as ReasonReference[])[0],
              coding: extractCoding(resource.code)
            };
            if (!this.listContainsProcedure(this.cancerRelatedSurgicalProcedures, tempCancerRelatedSurgicalProcedure)) {
              this.cancerRelatedSurgicalProcedures.push(tempCancerRelatedSurgicalProcedure);
            }
          }
        }

        if (
          resource.resourceType === 'MedicationStatement' &&
          resourceContainsProfile(resource, MCODE_CANCER_RELATED_MEDICATION_STATEMENT)
        ) {
          this.cancerRelatedMedicationStatements = this.addCoding(
            this.cancerRelatedMedicationStatements,
            resource.medicationCodeableConcept?.coding
          );
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
   * @param codes the codes to add - if undefined, nothing is added (undefined
   *    is allowed to make checking easier)
   * @returns
   */
  private addCoding(codingList: fhir.Coding[], codes: fhir.Coding[] | undefined): fhir.Coding[] {
    if (Array.isArray(codes)) {
      for (const code of codes) {
        if (!this.contains(codingList, code)) {
          codingList.push(code);
        }
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
