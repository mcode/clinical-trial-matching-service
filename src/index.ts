// Export our public API from this package

/**
 * Namespace the FHIR types within FHIR as ResearchStudy overlaps otherwise
 */
export * as fhir from './fhir-types';
export * from './research-study';
export * from './searchset';

// The export { v } from "mod" forms do not appear to work yet
import RequestError from './request-error';
import ClinicalTrialMatchingService, { ClinicalTrialMatcher, Configuration } from './server';

// Export the utility for configuring from the environment
export * from './env';

export default ClinicalTrialMatchingService;
export {
  ClinicalTrialMatcher,
  ClinicalTrialMatchingService,
  Configuration as ServiceConfiguration,
  RequestError
};
