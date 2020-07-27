// Export our public API from this package

// This somewhat ugly code is necessary for TypeScript

import ClinicalTrialMatchingService from './server';
import ResearchStudy from './research-study';
import SearchSet from './searchset';
import RequestError from './request-error';

export {
  ClinicalTrialMatchingService,
  RequestError,
  ResearchStudy,
  SearchSet
};

export default ClinicalTrialMatchingService;