// Export our public API from this package

export * from './bundle';
export * from './research-study';
export * from './searchset';

// The export { v } from "mod" forms do not appear to work yet
import RequestError from './request-error';
import ClinicalTrialMatchingService, { ClinicalTrialMatcher } from './server';

// Export the utility for configuring from the environment
export * from './env';

export default ClinicalTrialMatchingService;
export {
  ClinicalTrialMatcher,
  ClinicalTrialMatchingService,
  RequestError
};
