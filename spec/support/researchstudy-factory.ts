import { CLINICAL_TRIAL_IDENTIFIER_CODING_SYSTEM_URL } from '../../src/clinicaltrialsgov';
import type { ResearchStudy as IResearchStudy } from 'fhir/r4';
import { ResearchStudy } from '../../src/research-study';
import { SearchBundleEntry } from '../../src/searchset';

export function createResearchStudyObject(nctId?: string): ResearchStudy {
  const result = new ResearchStudy(nctId ?? 'test');
  if (nctId) {
    result.identifier = [
      {
        system: CLINICAL_TRIAL_IDENTIFIER_CODING_SYSTEM_URL,
        value: nctId
      }
    ];
  }
  return result;
}

export function createResearchStudy(id: string, nctId?: string): IResearchStudy {
  const result: IResearchStudy = {
    resourceType: 'ResearchStudy',
    id: id,
    // Default status to active
    status: 'active'
  };
  if (nctId) {
    result.identifier = [
      {
        system: CLINICAL_TRIAL_IDENTIFIER_CODING_SYSTEM_URL,
        value: nctId
      }
    ];
  }
  return result;
}

export function createSearchSetEntry(id: string, nctId?: string, score?: number): SearchBundleEntry {
  const result: SearchBundleEntry = {
    resource: createResearchStudy(id, nctId),
    search: {
      mode: 'match',
      score: score || 0
    }
  };
  return result;
}
