// Export our public API from this package

// This somewhat ugly code is necessary for TypeScript

import Bundle from './bundle';
import ClinicalTrialMatchingService, { ClinicalTrialMatcher } from './server';
import ResearchStudy from './research-study';
import SearchSet from './searchset';
import RequestError from './request-error';

export {
  Bundle,
  ClinicalTrialMatcher,
  ClinicalTrialMatchingService,
  RequestError,
  ResearchStudy,
  SearchSet
};

export default ClinicalTrialMatchingService;