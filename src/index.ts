// Export our public API from this package

/**
 * Namespace the FHIR types within FHIR as ResearchStudy overlaps otherwise
 */
export * from './research-study';
export * from './searchset';
export * from './clinicaltrialsgov';
export { CodeMapper, CodeSystemEnum } from './codeMapper';
export * from './mcodeextractor';
export { MappingLogic } from './mappinglogic';

// The export { v } from "mod" forms do not appear to work yet
import { Study } from './ctg-api';
import BasicHttpError, { HttpError, ServerError, ClientError } from './errors';
import ClinicalTrialMatchingService, { ClinicalTrialMatcher, Configuration } from './server';

// Export the utility for configuring from the environment
export * from './env';

export default ClinicalTrialMatchingService;
export {
  Study,
  ClinicalTrialMatcher,
  ClinicalTrialMatchingService,
  Configuration as ServiceConfiguration,
  BasicHttpError,
  HttpError,
  ClientError,
  ServerError
};
