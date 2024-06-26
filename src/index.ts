// Export our public API from this package

/**
 * Namespace the FHIR types within FHIR as ResearchStudy overlaps otherwise
 */
export * from './research-study';
export * from './searchset';
export * from './clinicaltrialsgov';
export * from './fhir-util';
export * from './tnm';
export { CodeMapper, CodeSystemEnum } from './codeMapper';
export * from './mcodeextractor';
export { Study } from './ctg-api';
export { BasicHttpError, HttpError, ServerError, ClientError } from './errors';
export { QueryParameters } from './query-parameters';
export { ClinicalTrialsGovAPI } from './clinicaltrialsgov-api';
export { createResearchStudyFromClinicalStudy } from './study-fhir-converter';
export * from './env';

// In order to export a default, we need to import it, so import it
import ClinicalTrialMatchingService, { ClinicalTrialMatcher, Configuration } from './server';

// And re-export it
export default ClinicalTrialMatchingService;
export {
  ClinicalTrialMatcher,
  ClinicalTrialMatchingService,
  Configuration as ServiceConfiguration,
};
