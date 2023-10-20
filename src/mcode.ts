// MCode constants

const MCODE_STRUCTURE_DEFINITION = 'http://hl7.org/fhir/us/mcode/StructureDefinition/';

/**
 * mCODE primary cancer condition profile URL.
 * https://hl7.org/fhir/us/mcode/StructureDefinition-mcode-primary-cancer-condition.html
 */
export const MCODE_PRIMARY_CANCER_CONDITION = MCODE_STRUCTURE_DEFINITION + 'mcode-primary-cancer-condition';

export const MCODE_SECONDARY_CANCER_CONDITION = MCODE_STRUCTURE_DEFINITION + 'mcode-secondary-cancer-condition';

/**
 * TNM clinical stage group. This was removed in mCODE STU2 but is kept for
 * backwards compatibility reasons. Replaced with {@link MCODE_CLINICAL_STAGE_GROUP}.
 */
export const MCODE_TNM_CLINICAL_STAGE_GROUP = MCODE_STRUCTURE_DEFINITION + 'mcode-tnm-clinical-stage-group';

/**
 * TNM pathological stage group. This was removed in mCODE STU2 but is kept for
 * backwards compatibility reasons. Replaced with {@link MCODE_CLINICAL_STAGE_GROUP}.
 */
export const MCODE_TNM_PATHOLOGICAL_STAGE_GROUP = MCODE_STRUCTURE_DEFINITION + 'mcode-tnm-pathological-stage-group';

/**
 * Clinical stage group. Added in mCODE STU2.
 */
export const MCODE_CLINICAL_STAGE_GROUP = MCODE_STRUCTURE_DEFINITION + 'mcode-clinical-stage-group';

/**
 * mCode histology morphology behavior extension URL.
 * https://hl7.org/fhir/us/mcode/StructureDefinition-mcode-histology-morphology-behavior.html
 */
export const MCODE_HISTOLOGY_MORPHOLOGY_BEHAVIOR = MCODE_STRUCTURE_DEFINITION + 'mcode-histology-morphology-behavior';
export const MCODE_CANCER_GENETIC_VARIANT = MCODE_STRUCTURE_DEFINITION + 'mcode-cancer-genetic-variant';
export const MCODE_TUMOR_MARKER = MCODE_STRUCTURE_DEFINITION + 'mcode-tumor-marker';
export const MCODE_CANCER_PATIENT = MCODE_STRUCTURE_DEFINITION + 'mcode-cancer-patient';
export const MCODE_ECOG_PERFORMANCE_STATUS = MCODE_STRUCTURE_DEFINITION + 'mcode-ecog-performance-status';
export const MCODE_KARNOFSKY_PERFORMANCE_STATUS = MCODE_STRUCTURE_DEFINITION + 'mcode-karnofsky-performance-status';

export const MCODE_CANCER_RELATED_SURGICAL_PROCEDURE =
  MCODE_STRUCTURE_DEFINITION + 'mcode-cancer-related-surgical-procedure';

export const MCODE_CANCER_RELATED_MEDICATION_STATEMENT =
  MCODE_STRUCTURE_DEFINITION + 'mcode-cancer-related-medication-statement';
export const MCODE_CANCER_RELATED_RADIATION_PROCEDURE =
  MCODE_STRUCTURE_DEFINITION + 'mcode-cancer-related-radiation-procedure';
