// Export our public API from this package

import _Service from './server';
import _ResearchStudy from './research-study';
import _SearchSet from './searchset';

export const ClinicalTrialMatchingService = _Service;
export const ResearchStudy = _ResearchStudy;
export const SearchSet = _SearchSet;

export default ClinicalTrialMatchingService;